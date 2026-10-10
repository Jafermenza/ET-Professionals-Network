import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
let gate4RegisteredAccount=null;
import { getPool, closePool } from "../src/platform/db.js";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function apiContext(){
  const api = await playwrightRequest.newContext({baseURL:API_BASE});
  const login = await api.post("/api/v1/auth/login",{data:{email:ADMIN_EMAIL,password:ADMIN_PASSWORD}});
  expect(login.status(),"CI administrator login").toBe(200);
  const payload=await login.json();
  expect(typeof payload?.data?.token).toBe("string");
  return {api,token:payload.data.token};
}
async function browserLogin(page,email=ADMIN_EMAIL,password=ADMIN_PASSWORD){
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button",{name:"Login"}).click();
  await expect(page.getByRole("button",{name:"Logout"})).toBeVisible();
}
let cachedReviewerToken=null;
async function independentReviewerToken(api,adminToken){
  if(cachedReviewerToken) return cachedReviewerToken;
  const suffix=randomUUID();
  const reviewerEmail="gate4-reviewer-"+suffix+"@example.test";
  const reviewerPassword="gate4-reviewer-password-12345";
  const reviewerRegistration=await api.post("/api/v1/auth/register",{data:{email:reviewerEmail,password:reviewerPassword,firstName:"Gate4",lastName:"Reviewer"}});
  expect(reviewerRegistration.status(),"independent reviewer registration").toBe(201);
  const reviewerId=(await reviewerRegistration.json()).data.user.id;
  const adminProfile=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+adminToken}});
  expect(adminProfile.status(),"admin identity for reviewer fixture audit").toBe(200);
  const adminId=(await adminProfile.json()).data.user_id;
  await getPool().query("insert into app_user_role(user_id,role_id,assigned_by) select $1,id,$2 from app_role where role_code='reviewer' on conflict do nothing",[reviewerId,adminId]);
  const reviewerLogin=await api.post("/api/v1/auth/login",{data:{email:reviewerEmail,password:reviewerPassword}});
  expect(reviewerLogin.status(),"independent reviewer login").toBe(200);
  cachedReviewerToken=(await reviewerLogin.json()).data.token;
  return cachedReviewerToken;
}
async function createVerifiedOrganization(api,token,prefix){
  const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
  const name=prefix+" "+suffix;
  const headers={authorization:"Bearer "+token};
  const created=await api.post("/api/v1/organizations",{headers,data:{legalName:name,displayName:name,organizationType:"company"}});
  expect(created.status(),"organization creation").toBe(201);
  const organization=(await created.json()).data;
  const submitted=await api.post("/api/v1/organizations/"+organization.id+"/submit-verification",{headers});
  expect(submitted.status(),"organization verification submission").toBe(200);
  // Keep initiation and approval separate: reuse one independent reviewer fixture across this E2E run.
  const reviewerToken=await independentReviewerToken(api,token);
  const reviewerHeaders={authorization:"Bearer "+reviewerToken};
  const reviewed=await api.post("/api/v1/review/organizations",{headers:reviewerHeaders,data:{organizationId:organization.id,decision:"verified",reason:"Browser E2E independent reviewer fixture"}});
  expect(reviewed.status(),"organization verification decision by independent reviewer").toBe(200);
  return organization;
}
async function createPublishedJob(api,token){
  const organization=await createVerifiedOrganization(api,token,"Browser Gate 4 Jobs");
  const headers={authorization:"Bearer "+token};
  const title="Browser Gate 4 Opportunity "+Date.now();
  const created=await api.post("/api/v1/jobs",{headers,data:{organizationId:organization.id,title,description:"Browser E2E persisted workflow fixture",postingScope:"public",visibility:"public"}});
  expect(created.status(),"job creation").toBe(201);
  const job=(await created.json()).data;
  const published=await api.post("/api/v1/jobs/"+job.id+"/publish",{headers});
  expect(published.status(),"job publication").toBe(200);
  return {title,jobId:job.id};
}

test("public jobs, services, mentorship and organization screens load without runtime errors",async({page})=>{
  const failures=[];
  page.on("pageerror",error=>failures.push(error.message));
  const screens=[
    ["/jobs","Opportunities, without the maze."],
    ["/services","Find help, then deliver it well."],
    ["/mentorship","One goal. One good match."],
    ["/organizations","Build a trusted organization profile."]
  ];
  for(const [path,heading] of screens){
    await page.goto(path);
    await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
  }
  expect(failures,"browser runtime errors across Gate 4 screens").toEqual([]);
});

test("jobs search, saved state and alert criteria persist across browser reload",async({page})=>{
  const {api,token}=await apiContext();
  try{
    const {title,jobId}=await createPublishedJob(api,token);
    const directSearch=await api.get("/api/v1/jobs?q="+encodeURIComponent(title));
    expect(directSearch.status()).toBe(200);
    expect((await directSearch.json()).data.items.some(item=>item.id===jobId)).toBeTruthy();
    await browserLogin(page);
    await page.goto("/jobs");
    await page.getByPlaceholder("Search job title or description").fill(title);
    await page.getByRole("button",{name:"Apply filters"}).click();
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Save opportunity"}).click();
    await expect(page.getByRole("status")).toContainText("Opportunity saved to your account.");
    await page.getByRole("button",{name:"Save job alert"}).click();
    await expect(page.getByRole("status")).toContainText("daily in-app job alert was saved");
    await page.reload();
    await expect(page.getByRole("button",{name:"Remove saved opportunity"})).toBeVisible();
    const headers={authorization:"Bearer "+token};
    const saved=await api.get("/api/v1/me/saved-jobs",{headers});
    expect(saved.status()).toBe(200);
    expect((await saved.json()).data.some(item=>item.id===jobId)).toBeTruthy();
    const alerts=await api.get("/api/v1/me/job-alerts",{headers});
    expect(alerts.status()).toBe(200);
    expect((await alerts.json()).data.some(item=>JSON.stringify(item.criteria).includes(title))).toBeTruthy();
  }finally{await api.dispose();}
});

test("organization screen uploads private evidence and submits verification",async({page})=>{
  const {api,token}=await apiContext();
  try{
    const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
    const name="Browser Evidence Organization "+suffix;
    const created=await api.post("/api/v1/organizations",{headers:{authorization:"Bearer "+token},data:{legalName:name,displayName:name,organizationType:"company"}});
    expect(created.status()).toBe(201);
    const organization=(await created.json()).data;
    await browserLogin(page);
    const uploadDiagnostics=[];
    page.on("requestfailed",request=>{if(request.url().includes("/api/v1/files/")||request.url().includes("verification-evidence"))uploadDiagnostics.push("request failed "+request.method()+" "+request.url()+" "+(request.failure()?.errorText||""));});
    page.on("response",response=>{if((response.url().includes("/api/v1/files/")||response.url().includes("verification-evidence"))&&response.status()>=400)void response.text().then(body=>uploadDiagnostics.push("HTTP "+response.status()+" "+response.url()+" "+body.slice(0,500)));});
    await page.goto("/organizations");
    await page.getByLabel("Organization").selectOption(organization.id);
    await page.getByLabel("Private document").setInputFiles({
      name:"registration-evidence.pdf",
      mimeType:"application/pdf",
      buffer:Buffer.from("%PDF-1.7\nBrowser private evidence fixture\n%%EOF")
    });
    await page.getByRole("button",{name:"Upload and attach private evidence"}).click();
    await expect.poll(async()=>await page.getByRole("status").count()+((await page.getByRole("alert").allTextContents()).filter(text=>text.trim()).length)).toBeGreaterThan(0);
    const uploadErrors=(await page.getByRole("alert").allTextContents()).filter(text=>text.trim());
    if(uploadErrors.length) throw new Error("Private evidence upload failed: "+uploadErrors.join(" | ")+". Network: "+uploadDiagnostics.join(" | "));
    await expect(page.getByRole("status")).toContainText("Private evidence uploaded, checksum-verified and attached");
    const {title,jobId}=await createPublishedJob(api,token);
    const inquiryName="Browser Inquiry "+suffix;
    const inquiryResponse=await api.post("/api/v1/public/opportunity-inquiries",{data:{inquiryType:"job",jobId,contactName:inquiryName,contactEmail:"browser-inquiry-"+suffix+"@example.test",intent:"Browser inquiry decision test",consent:true}});
    expect(inquiryResponse.status()).toBe(201);
    const inquiry=(await inquiryResponse.json()).data;
    await page.reload();
    await expect(page.getByText(inquiryName,{exact:true})).toBeVisible();
    await page.getByLabel("Decision for "+inquiry.public_reference).selectOption("contacted");
    await page.getByLabel("Consider non-member for "+inquiry.public_reference).check();
    await page.getByLabel("Decision note for "+inquiry.public_reference).fill("Browser decision persisted");
    await page.locator(".case-row").filter({hasText:inquiry.public_reference}).getByRole("button",{name:"Save inquiry decision"}).click();
    await expect(page.getByRole("status")).toContainText("Inquiry decision saved.");
    await page.locator(".case-row").filter({hasText:name}).getByRole("button",{name:"Submit for verification"}).click();
    await expect(page.getByRole("status")).toContainText("Verification submission was accepted by the server.");
    const detail=await api.get("/api/v1/organizations/"+organization.id,{headers:{authorization:"Bearer "+token}});
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.verification_status).toBe("pending");
    const tracking=await api.get("/api/v1/me/application-tracking",{headers:{authorization:"Bearer "+token}});
    expect(tracking.status(),"organization application tracking must not reference nonexistent schema columns").toBe(200);
    expect((await tracking.json()).data.items.some(item=>item.type==="organization"&&item.id===organization.id&&item.status==="pending")).toBeTruthy();
  }finally{await api.dispose();}
});


test("service search and request form use published API data and persist a request",async({page})=>{
  const {api,token}=await apiContext();
  const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
  const memberEmail="browser-gate4-"+suffix+"@example.test";
  const memberPassword="browser-gate4-password-12345";
  try{
    const title="Browser Gate 4 Service "+suffix;
    const headers={authorization:"Bearer "+token};
    const listing=await api.post("/api/v1/services",{headers,data:{title,description:"Browser E2E service request fixture",serviceCategory:"consulting",pricingModel:"quote",visibility:"public"}});
    expect(listing.status()).toBe(201);
    const listingId=(await listing.json()).data.id;
    const published=await api.post("/api/v1/services/"+listingId+"/status",{headers,data:{status:"published"}});
    expect(published.status()).toBe(200);
    const registered=await api.post("/api/v1/auth/register",{data:{email:memberEmail,password:memberPassword,firstName:"Browser",lastName:"Requester"+suffix}});
    expect(registered.status()).toBe(201);
    const registeredData=(await registered.json()).data;
    const memberId=registeredData.user.id;
    const db=getPool();
    const product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
    expect(product).toBeTruthy();
    await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[memberId,product.id,"E2E-"+memberId.slice(0,8)]);
    await browserLogin(page,memberEmail,memberPassword);
    await page.goto("/services");
    await page.getByPlaceholder("Category, capability or keyword").fill(title);
    await page.getByRole("button",{name:"Search",exact:true}).click();
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Request this service"}).click();
    await page.getByLabel("Message to the provider").fill("Please contact me about the scope and timeline.");
    await page.getByRole("button",{name:"Submit service request"}).click();
    await expect(page.getByRole("status")).toContainText("Your service request was submitted.");
    const requests=await api.get("/api/v1/me/service-requests",{headers:{authorization:"Bearer "+registeredData.token}});
    expect(requests.status()).toBe(200);
    expect((await requests.json()).data.some(item=>item.service_title===title&&item.status==="requested")).toBeTruthy();
  }finally{
    await api.dispose();
    await closePool();
  }
});

test("mentorship request form supports a goal without a preferred mentor",async({page})=>{
  const {api,token}=await apiContext();
  try{
    await browserLogin(page);
    await page.goto("/mentorship");
    await page.getByRole("button",{name:"Request mentorship without a preferred mentor"}).click();
    await page.getByPlaceholder("What outcome do you want help achieving?").fill("Browser E2E goal: improve professional leadership.");
    await page.getByRole("button",{name:"Submit mentorship request"}).click();
    await expect(page.getByRole("heading",{name:"Your request is in the system"})).toBeVisible();
    const reference=await page.getByText(/Request reference:/).textContent();
    const id=reference?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    expect(id).toBeTruthy();
    const detail=await api.get("/api/v1/mentorship/requests/"+id,{headers:{authorization:"Bearer "+token}});
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.goals).toBe("Browser E2E goal: improve professional leadership.");
    expect((await detail.json()).data.preferred_mentor_user_id).toBeNull();
    const candidates=await api.get("/api/v1/mentorship/requests/"+id+"/matches",{headers:{authorization:"Bearer "+token}});
    expect(candidates.status()).toBe(200);
    expect(Array.isArray((await candidates.json()).data)).toBeTruthy();
    const mine=await api.get("/api/v1/me/mentorship-requests",{headers:{authorization:"Bearer "+token}});
    expect(mine.status()).toBe(200);
    expect((await mine.json()).data.some(row=>row.id===id&&row.goals==="Browser E2E goal: improve professional leadership.")).toBeTruthy();
    const other=await api.post("/api/v1/auth/register",{data:{email:"mentorship-private-"+Date.now()+"@example.test",password:"mentorship-private-password-12345",firstName:"Private",lastName:"Requester"+Date.now()}});
    expect(other.status()).toBe(201);
    const otherToken=(await other.json()).data.token;
    const privateRead=await api.get("/api/v1/mentorship/requests/"+id,{headers:{authorization:"Bearer "+otherToken}});
    expect(privateRead.status()).toBe(404,"another user's mentorship request must not be disclosed");
    const missingGoal=await api.post("/api/v1/mentorship/requests",{headers:{authorization:"Bearer "+token},data:{goals:"   "}});
    expect(missingGoal.status()).toBe(400,"a formal mentorship request must include a meaningful goal");
    await page.reload();
    await expect(page.getByText("Browser E2E goal: improve professional leadership.")).toBeVisible();
  }finally{await api.dispose();}
});


test("profile and notification preferences save to PostgreSQL and survive reload",async({page})=>{
 const {api}=await apiContext();
 const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
 const email="browser-profile-"+suffix+"@example.test",password="browser-profile-password-12345";
 try{
   const registered=await api.post("/api/v1/auth/register",{data:{email,password,firstName:"Profile",lastName:"Acceptance"+suffix}});
   expect(registered.status()).toBe(201);
   const registeredData=(await registered.json()).data;
   gate4RegisteredAccount={email,password,token:registeredData.token};
   await browserLogin(page,email,password);
   await page.goto("/profile");
   await expect(page.getByLabel("Professional headline")).toBeVisible();
   await page.getByLabel("Professional headline").fill("Gate 4 persisted profile "+suffix);
   await page.getByLabel("Professional bio").fill("Profile update must persist through the account API.");
   await page.getByLabel("Professional directory visibility").selectOption("members");
   await page.getByRole("button",{name:"Save profile"}).click();
   await expect(page.getByRole("status")).toContainText("Profile changes were saved");
   await page.getByLabel("Email",{exact:true}).uncheck();
   await page.getByRole("button",{name:"Save notification preferences"}).click();
   await expect(page.getByRole("status")).toContainText("Notification preferences were saved");
   await page.reload();
   await expect(page.getByLabel("Professional headline")).toHaveValue("Gate 4 persisted profile "+suffix);
   await expect(page.getByLabel("Professional directory visibility")).toHaveValue("members");
   await expect(page.getByLabel("Email",{exact:true})).not.toBeChecked();
   const headers={authorization:"Bearer "+registeredData.token};
   const me=await api.get("/api/v1/me",{headers});
   expect(me.status()).toBe(200);
   expect((await me.json()).data.headline).toBe("Gate 4 persisted profile "+suffix);
   const prefs=await api.get("/api/v1/notifications/preferences",{headers});
   expect(prefs.status()).toBe(200);
   expect((await prefs.json()).data.email_enabled).toBe(false);
 }finally{await api.dispose();}
});

test("formal job application is distinct from public inquiry and persists submitted state",async({page})=>{
 const {api,token}=await apiContext();
 const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
 const email="browser-applicant-"+suffix+"@example.test",password="browser-applicant-password-12345";
 try{
   const {title,jobId}=await createPublishedJob(api,token);
   let account=gate4RegisteredAccount;
   if(!account){
     const registered=await api.post("/api/v1/auth/register",{data:{email,password,firstName:"Formal",lastName:"Applicant"+suffix}});
     expect(registered.status()).toBe(201);
     account=(await registered.json()).data;
     gate4RegisteredAccount={email,password,token:account.token};
   }
   await browserLogin(page,account.email,account.password);
   await page.goto("/jobs");
   await page.getByPlaceholder("Search job title or description").fill(title);
   await page.getByRole("button",{name:"Apply filters"}).click();
   await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
   await page.getByRole("button",{name:"View details"}).click();
   await page.getByLabel("Cover letter (optional)").fill("I am applying through the formal application workflow.");
   await page.getByRole("button",{name:"Submit formal application"}).click();
   await expect(page.getByRole("status")).toContainText("Formal application submitted");
   const applications=await api.get("/api/v1/me/job-applications",{headers:{authorization:"Bearer "+account.token}});
   expect(applications.status()).toBe(200);
   const rows=(await applications.json()).data;
   expect(rows.some(item=>item.job_id===jobId&&item.status==="submitted"&&item.cover_letter==="I am applying through the formal application workflow.")).toBeTruthy();
   const tracking=await api.get("/api/v1/me/application-tracking",{headers:{authorization:"Bearer "+account.token}});
   expect(tracking.status(),"application tracking must use the committed PostgreSQL schema").toBe(200);
   const trackingItems=(await tracking.json()).data.items;
   expect(trackingItems.some(item=>item.type==="job"&&item.id===rows.find(row=>row.job_id===jobId)?.id&&item.status==="submitted")).toBeTruthy();
   const duplicate=await api.post("/api/v1/jobs/"+jobId+"/application-drafts",{headers:{authorization:"Bearer "+account.token},data:{coverLetter:"duplicate attempt"}});
   expect(duplicate.status()).toBe(409,"submitted applications must not be duplicated");
 }finally{await api.dispose();}
});

test("service requests enforce membership, self-request, duplicate, and participant transitions",async({page})=>{
 const {api,token}=await apiContext();
 const suffix=Date.now()+"-"+Math.random().toString(16).slice(2),password="browser-service-password-12345";
 try{
   const title="Browser Service Lifecycle "+suffix;
   const listing=await api.post("/api/v1/services",{headers:{authorization:"Bearer "+token},data:{title,description:"Provider/requester transition fixture",serviceCategory:"consulting",pricingModel:"quote",visibility:"public"}});
   expect(listing.status()).toBe(201);
   const listingId=(await listing.json()).data.id;
   expect((await api.post("/api/v1/services/"+listingId+"/status",{headers:{authorization:"Bearer "+token},data:{status:"published"}})).status()).toBe(200);
   const self=await api.post("/api/v1/services/"+listingId+"/requests",{headers:{authorization:"Bearer "+token},data:{message:"self request must fail"}});
   expect(self.status()).toBe(409);
   const unmember=await api.post("/api/v1/auth/register",{data:{email:"service-unmember-"+suffix+"@example.test",password,firstName:"Service",lastName:"Member"+suffix}});
   expect(unmember.status()).toBe(201);
   const member=(await unmember.json()).data;
   const headers={authorization:"Bearer "+member.token};
   const denied=await api.post("/api/v1/services/"+listingId+"/requests",{headers,data:{message:"membership required"}});
   expect(denied.status()).toBe(403);
   const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
   expect(product).toBeTruthy();
   await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[member.user.id,product.id,"G4-SVC-"+member.user.id.slice(0,8)]);
   const created=await api.post("/api/v1/services/"+listingId+"/requests",{headers,data:{message:"Please scope a consulting engagement."}});
   expect(created.status()).toBe(201);
   const request=(await created.json()).data;
   const duplicate=await api.post("/api/v1/services/"+listingId+"/requests",{headers,data:{message:"retry duplicate"}});
   expect(duplicate.status()).toBe(409);
   const requesterCannotAccept=await api.post("/api/v1/service-requests/"+request.id+"/status",{headers,data:{status:"accepted"}});
   expect(requesterCannotAccept.status()).toBe(403);
   await browserLogin(page);
   await page.goto("/services");
   const requestCard=page.locator(".case-row").filter({hasText:title});
   await expect(requestCard.getByRole("button",{name:"Accept request"})).toBeVisible();
   await requestCard.getByRole("button",{name:"Accept request"}).click();
   await expect(page.getByRole("status")).toContainText("Service request updated: accepted");
   await page.getByRole("button",{name:"Start delivery"}).click();
   await expect(page.getByRole("status")).toContainText("Service request updated: in progress");
   await page.getByRole("button",{name:"Submit delivery for acceptance"}).click();
   await expect(page.getByRole("status")).toContainText("Service request updated: completed");
   const delivered=await api.get("/api/v1/me/service-requests",{headers});
   expect(delivered.status()).toBe(200);
   expect((await delivered.json()).data.some(row=>row.id===request.id&&row.provider_completed_at)).toBeTruthy();
   await browserLogin(page,"service-unmember-"+suffix+"@example.test",password);
   await page.goto("/services");
   const requesterCard=page.locator(".case-row").filter({hasText:title});
   await expect(requesterCard.getByRole("button",{name:"Accept delivered outcome"})).toBeVisible();
   await requesterCard.getByRole("button",{name:"Accept delivered outcome"}).click();
   await expect(page.getByRole("status")).toContainText("Delivered outcome accepted");
   const list=await api.get("/api/v1/me/service-requests",{headers});
   expect(list.status()).toBe(200);
   expect((await list.json()).data.some(row=>row.id===request.id&&row.requester_accepted_at)).toBeTruthy();
 }finally{await api.dispose();await closePool();}
});

test("organization onboarding rejects duplicate names, cross-organization reads and foreign private evidence",async()=>{
 const {api,token}=await apiContext();
 const suffix=Date.now()+"-"+Math.random().toString(16).slice(2),password="browser-org-owner-password-12345";
 try{
   const registeredA=await api.post("/api/v1/auth/register",{data:{email:"org-owner-a-"+suffix+"@example.test",password,firstName:"Organization",lastName:"OwnerA"+suffix}});
   expect(registeredA.status()).toBe(201);
   const ownerA=(await registeredA.json()).data,headersA={authorization:"Bearer "+ownerA.token};
   const name="Scoped Organization "+suffix;
   const createdA=await api.post("/api/v1/organizations",{headers:headersA,data:{legalName:name+" A",displayName:name+" A",organizationType:"company"}});
   expect(createdA.status()).toBe(201);
   const createdB=await api.post("/api/v1/organizations",{headers:{authorization:"Bearer "+token},data:{legalName:name+" B",displayName:name+" B",organizationType:"company"}});
   expect(createdB.status()).toBe(201);
   const organization=(await createdB.json()).data;
   const duplicate=await api.post("/api/v1/organizations",{headers:{authorization:"Bearer "+token},data:{legalName:name+" B",displayName:name+" B",organizationType:"company"}});
   expect(duplicate.status()).toBe(409);
   const crossRead=await api.get("/api/v1/organizations/"+organization.id,{headers:headersA});
   expect(crossRead.status()).toBe(404);
   const crossWrite=await api.post("/api/v1/organizations/"+organization.id+"/verification-evidence",{headers:headersA,data:{fileObjectId:"00000000-0000-4000-8000-000000000001",evidenceType:"registration_document"}});
   expect(crossWrite.status()).toBe(403);
   const bytes=Buffer.from("%PDF-1.7\nprivate ownership fixture\n%%EOF");
   const checksum=createHash("sha256").update(bytes).digest("hex");
   const authorization=await api.post("/api/v1/files/uploads",{headers:headersA,data:{fileName:"owner-a-private.pdf",contentType:"application/pdf",byteSize:bytes.length,checksumSha256:checksum}});
   expect(authorization.status()).toBe(201);
   const upload=(await authorization.json()).data;
   const uploaded=await api.put(upload.uploadUrl,{headers:{authorization:"Bearer "+ownerA.token,"content-type":"application/octet-stream","x-upload-token":upload.uploadToken},data:bytes});
   expect(uploaded.status()).toBe(201);
   const confirmed=await api.post("/api/v1/files/uploads/"+upload.uploadId+"/confirm",{headers:headersA});
   expect(confirmed.status()).toBe(201);
   const fileId=(await confirmed.json()).data.id;
   const foreignEvidence=await api.post("/api/v1/organizations/"+organization.id+"/verification-evidence",{headers:{authorization:"Bearer "+token},data:{fileObjectId:fileId,evidenceType:"registration_document"}});
   expect(foreignEvidence.status()).toBe(400);
   const customType="gate4-evidence-"+suffix;
   const requirement=await api.post("/api/v1/admin/organization-verification-requirements",{headers:{authorization:"Bearer "+token},data:{organizationType:customType,evidenceType:"required_document",label:"Gate 4 required evidence",required:true,active:true}});
   expect(requirement.status()).toBe(201);
   const missingEvidenceOrg=await api.post("/api/v1/organizations",{headers:headersA,data:{legalName:"Missing Evidence "+suffix,displayName:"Missing Evidence "+suffix,organizationType:customType}});
   expect(missingEvidenceOrg.status()).toBe(201);
   const missingOrgId=(await missingEvidenceOrg.json()).data.id;
   const missingEvidenceSubmit=await api.post("/api/v1/organizations/"+missingOrgId+"/submit-verification",{headers:headersA});
   expect(missingEvidenceSubmit.status()).toBe(400,"verification must not submit while a required evidence type is missing");
 }finally{await api.dispose();}
});


test("jobs discovery presents explicit empty and API failure states",async({page})=>{
 await page.goto("/jobs");
 await page.getByPlaceholder("Search job title or description").fill("gate4-no-result-"+Date.now());
 await page.getByRole("button",{name:"Apply filters"}).click();
 await expect(page.getByRole("heading",{name:"No matching opportunities"})).toBeVisible();
 await page.route("**/api/v1/jobs**",route=>route.abort());
 await page.reload();
 await expect(page.locator('[role="alert"].form-error')).toContainText("We couldn\'t load opportunities right now.");
});


test("organization public inquiry decisions persist and remain organization-authorized",async({page})=>{
 const {api,token}=await apiContext();
 const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
 try{
   const {title,jobId}=await createPublishedJob(api,token);
   const created=await api.post("/api/v1/public/opportunity-inquiries",{data:{inquiryType:"job",jobId,contactName:"Public Candidate "+suffix,contactEmail:"public-candidate-"+suffix+"@example.test",intent:"Interested in this published opportunity.",consent:true}});
   expect(created.status()).toBe(201);
   const inquiry=(await created.json()).data;
   await browserLogin(page);
   await page.goto("/organizations");
   await expect(page.getByText(inquiry.public_reference,{exact:false})).toBeVisible();
   await page.getByLabel("Decision for "+inquiry.public_reference).selectOption("contacted");
   await page.getByLabel("Decision note for "+inquiry.public_reference).fill("Contacted through the Gate 4 acceptance journey.");
   await page.getByRole("button",{name:"Save inquiry decision"}).click();
   await expect(page.getByRole("status")).toContainText("Inquiry decision saved");
   const listed=await api.get("/api/v1/opportunity-inquiries?type=job",{headers:{authorization:"Bearer "+token}});
   expect(listed.status()).toBe(200);
   expect((await listed.json()).data.some(row=>row.id===inquiry.id&&row.status==="contacted")).toBeTruthy();
   expect(gate4RegisteredAccount).toBeTruthy();
   const unauthorized=await api.get("/api/v1/opportunity-inquiries?type=job",{headers:{authorization:"Bearer "+gate4RegisteredAccount.token}});
   expect(unauthorized.status()).toBe(403,"accounts without organization scope cannot inspect private inquiries");
 }finally{await api.dispose();}
});

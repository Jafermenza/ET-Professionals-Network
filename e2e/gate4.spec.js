import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
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
  const reviewerEmail="gate4-reviewer-ci@example.test";
  const reviewerPassword="gate4-reviewer-password-12345";
  let reviewerId;
  const existingLogin=await api.post("/api/v1/auth/login",{data:{email:reviewerEmail,password:reviewerPassword}});
  if(existingLogin.status()===200){
    cachedReviewerToken=(await existingLogin.json()).data.token;
    const me=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+cachedReviewerToken}});
    expect(me.status()).toBe(200);
    reviewerId=(await me.json()).data.user_id;
  } else {
    expect(existingLogin.status(),"unknown reviewer fixture should fail as unauthenticated before registration").toBe(401);
    const registration=await api.post("/api/v1/auth/register",{data:{email:reviewerEmail,password:reviewerPassword,firstName:"Gate4",lastName:"Reviewer"}});
    expect(registration.status(),"independent reviewer fixture registration").toBe(201);
    reviewerId=(await registration.json()).data.user.id;
  }
  const adminProfile=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+adminToken}});
  expect(adminProfile.status(),"admin identity for reviewer fixture audit").toBe(200);
  const adminId=(await adminProfile.json()).data.user_id;
  const role=await getPool().query("select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code='reviewer'",[reviewerId]);
  if(!role.rowCount) await getPool().query("insert into app_user_role(user_id,role_id,assigned_by) select $1,id,$2 from app_role where role_code='reviewer' on conflict do nothing",[reviewerId,adminId]);
  if(!cachedReviewerToken){
    const login=await api.post("/api/v1/auth/login",{data:{email:reviewerEmail,password:reviewerPassword}});
    expect(login.status(),"independent reviewer login").toBe(200);
    cachedReviewerToken=(await login.json()).data.token;
  }
  return cachedReviewerToken;
}

async function ensureGate4Professional(api){
 const email="gate4-professional-ci@example.test",password="gate4-professional-password-12345";
 let token;
 const login=await api.post("/api/v1/auth/login",{data:{email,password}});
 if(login.status()===200) token=(await login.json()).data.token;
 else {
  expect(login.status()).toBe(401);
  const registration=await api.post("/api/v1/auth/register",{data:{email,password,firstName:"Gate4",lastName:"Professional"}});
  if(registration.status()===201) token=(await registration.json()).data.token;
  else {
   expect(registration.status()).toBe(409);
   const retry=await api.post("/api/v1/auth/login",{data:{email,password}});
   expect(retry.status()).toBe(200);
   token=(await retry.json()).data.token;
  }
 }
 const meResponse=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+token}});
 expect(meResponse.status()).toBe(200);
 const me=(await meResponse.json()).data,userId=me.user_id,db=getPool();
 const product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 expect(product).toBeTruthy();
 const active=(await db.query("select id from membership_record where user_id=$1 and status='active' limit 1",[userId])).rows[0];
 if(!active){
  const existing=(await db.query("select id from membership_record where user_id=$1 order by created_at desc limit 1",[userId])).rows[0];
  if(existing) await db.query("update membership_record set status='active',start_date=current_date,end_date=current_date+365 where id=$1",[existing.id]);
  else await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[userId,product.id,"G4-PROFESSIONAL-"+userId.slice(0,8)]);
 }
 await db.query("insert into verification_claim_type(claim_code,name,active) values('professional_certification','Professional certification',true) on conflict(claim_code) do update set active=true");
 const claimType=(await db.query("select id from verification_claim_type where claim_code='professional_certification'")).rows[0];
 const verified=(await db.query("select vc.id from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and lower(vc.claim_code_snapshot)='professional_certification' and vc.status='verified' limit 1",[userId])).rows[0];
 if(!verified){
  const program=(await db.query("insert into verification_program(program_code,name,purpose,requires_consent,active) values('GATE4_PROFESSIONAL_FIXTURE','Gate 4 professional fixture','Test-only verified professional fixture',false,true) on conflict(program_code) do update set active=true returning id")).rows[0];
  const verificationCase=(await db.query("insert into verification_case(program_id,subject_user_id,status,purpose_snapshot,opened_by) values($1,$2,'review','Gate 4 test fixture: verified professional claim',$2) returning id",[program.id,userId])).rows[0];
  await db.query("insert into verification_claim(case_id,claim_type_id,claim_code_snapshot,claimed_value,status,verified_at) values($1,$2,'professional_certification',$3,'verified',now())",[verificationCase.id,claimType.id,JSON.stringify({fixture:"Gate 4 automated test"})]);
 }
 return {email,password,token,userId,displayName:me.display_name};
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
async function mockApiResponse(page,pattern,status,payload){
  const headers={
    "access-control-allow-origin":"http://127.0.0.1:3001",
    "access-control-allow-headers":"authorization,content-type",
    "access-control-allow-methods":"GET,OPTIONS",
    "access-control-allow-credentials":"true"
  };
  await page.route(pattern,async route=>{
    if(route.request().method()==="OPTIONS") return route.fulfill({status:204,headers});
    return route.fulfill({status,headers,contentType:"application/json",body:JSON.stringify(payload)});
  });
}
async function createActiveMember(api,prefix){
  const suffix=randomUUID();
  const email="gate4-"+prefix.toLowerCase()+"-"+suffix+"@example.test";
  const password="gate4-member-password-12345";
  const registration=await api.post("/api/v1/auth/register",{data:{email,password,firstName:"Gate4",lastName:prefix+suffix.slice(0,8)}});
  expect(registration.status(),"independent "+prefix+" account registration").toBe(201);
  const account=(await registration.json()).data;
  const db=getPool();
  const product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
  expect(product,"the acceptance database must include the BASIC membership product").toBeTruthy();
  await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[account.user.id,product.id,"G4-"+prefix+"-"+account.user.id.slice(0,8)]);
  return {...account,email,password,userId:account.user.id};
}
async function addVerifiedProfessionalClaim(userId,programCode){
  const db=getPool();
  await db.query("insert into verification_claim_type(claim_code,name,active) values('professional_certification','Professional certification',true) on conflict(claim_code) do update set active=true");
  const claimType=(await db.query("select id from verification_claim_type where claim_code='professional_certification'")).rows[0];
  const program=(await db.query("insert into verification_program(program_code,name,purpose,requires_consent,active) values($1,$2,'Test-only verified professional fixture',false,true) on conflict(program_code) do update set active=true returning id",[programCode,programCode+" fixture"])).rows[0];
  const verificationCase=(await db.query("insert into verification_case(program_id,subject_user_id,status,purpose_snapshot,opened_by) values($1,$2,'review','Gate 4 test fixture: verified professional claim',$2) returning id",[program.id,userId])).rows[0];
  await db.query("insert into verification_claim(case_id,claim_type_id,claim_code_snapshot,claimed_value,status,verified_at) values($1,$2,'professional_certification',$3,'verified',now())",[verificationCase.id,claimType.id,JSON.stringify({fixture:programCode})]);
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
    expect(Array.isArray((await tracking.json()).data.items),"application tracking returns a structured list").toBeTruthy();
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
    const otherToken=await independentReviewerToken(api,token);
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
 try{
   const account=await ensureGate4Professional(api);
   const registeredData={token:account.token,user:{id:account.userId}};
   await browserLogin(page,account.email,account.password);
   await page.goto("/profile");
   await expect(page.getByLabel("Professional headline")).toBeVisible();
   await page.getByLabel("Professional headline").fill("Gate 4 persisted profile "+suffix);
   await page.getByLabel("Professional bio").fill("Profile update must persist through the account API.");
   await page.getByLabel("Professional directory visibility").selectOption("members");
   await page.getByRole("button",{name:"Save profile"}).click();
   await expect(page.getByRole("status")).toContainText("Profile changes were saved");
   await page.getByLabel("Professional title").fill("Gate 4 directory profile "+suffix);
   await page.getByLabel("Years of experience").fill("5");
   await page.getByLabel("Availability status").selectOption("available");
   await page.getByLabel("Location label").fill("Addis Ababa");
   await page.getByLabel("Directory summary").fill("A persisted privacy-safe professional summary.");
   await page.getByLabel("Profile audience").selectOption("public");
   await page.getByRole("button",{name:"Save directory profile"}).click();
   await expect(page.getByRole("status")).toContainText("Professional directory profile saved");
   await page.getByLabel("List my profile in talent search").check();
   await page.getByLabel("Show location").check();
   await page.getByLabel("Show verified professional badge").check();
   await page.getByRole("button",{name:"Save directory privacy settings"}).click();
   await expect(page.getByRole("status")).toContainText("Talent directory consent and disclosure settings saved");
   await page.getByLabel("Email",{exact:true}).uncheck();
   await page.getByRole("button",{name:"Save notification preferences"}).click();
   await expect(page.getByRole("status")).toContainText("Notification preferences were saved");
   await page.reload();
   await expect(page.getByLabel("Professional headline")).toHaveValue("Gate 4 persisted profile "+suffix);
   await expect(page.getByLabel("Professional directory visibility")).toHaveValue("members");
   await expect(page.getByLabel("Email",{exact:true})).not.toBeChecked();
   await expect(page.getByLabel("Professional title")).toHaveValue("Gate 4 directory profile "+suffix);
   await expect(page.getByLabel("Availability status")).toHaveValue("available");
   await expect(page.getByLabel("List my profile in talent search")).toBeChecked();
   await expect(page.getByLabel("Show location")).toBeChecked();
   const headers={authorization:"Bearer "+registeredData.token};
   const me=await api.get("/api/v1/me",{headers});
   expect(me.status()).toBe(200);
   expect((await me.json()).data.headline).toBe("Gate 4 persisted profile "+suffix);
   const prefs=await api.get("/api/v1/notifications/preferences",{headers});
   expect(prefs.status()).toBe(200);
   expect((await prefs.json()).data.email_enabled).toBe(false);
   const talentProfile=await api.get("/api/v1/me/talent-profile",{headers});
   expect(talentProfile.status()).toBe(200);
   expect((await talentProfile.json()).data.professional_title).toBe("Gate 4 directory profile "+suffix);
   const talentVisibility=await api.get("/api/v1/me/talent-visibility",{headers});
   expect(talentVisibility.status()).toBe(200);
   expect((await talentVisibility.json()).data.directory_visible).toBe(true);
 }finally{await api.dispose();}
});

test("formal job application is distinct from public inquiry and persists submitted state",async({page})=>{
 const {api,token}=await apiContext();
 try{
   const account=await createActiveMember(api,"APPLICANT");
   const {title,jobId}=await createPublishedJob(api,token);
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
   const submitted=rows.find(item=>item.job_id===jobId&&item.status==="submitted");
   expect(submitted,"persisted formal application rows: "+JSON.stringify(rows)).toBeTruthy();
   expect(submitted.cover_letter,"submitted cover letter must persist").toBe("I am applying through the formal application workflow.");
   const outsider=await api.post("/api/v1/auth/register",{data:{email:"gate4-outsider-"+randomUUID()+"@example.test",password:"gate4-outsider-password-12345",firstName:"Other",lastName:"Candidate"}});
   expect(outsider.status()).toBe(201);
   const outsiderToken=(await outsider.json()).data.token;
   const privateProgress=await api.get("/api/v1/job-applications/"+submitted.id+"/progress",{headers:{authorization:"Bearer "+outsiderToken}});
   expect(privateProgress.status(),"another applicant must not read private application progress").toBe(404);
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
   await page.getByRole("button",{name:"Logout"}).click();
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
 await page.unroute("**/api/v1/jobs**");
 await mockApiResponse(page,"**/api/v1/jobs**",503,{error:{code:"SERVER_ERROR",message:"CI simulated upstream failure"}});
 let jobsFailureIntercepted=false;
 page.on("response",response=>{if(new URL(response.url()).pathname==="/api/v1/jobs"&&response.status()===503)jobsFailureIntercepted=true;});
 await page.getByRole("button",{name:"Apply filters"}).click();
 await expect.poll(()=>jobsFailureIntercepted,{message:"the jobs API failure fixture must intercept the real browser request"}).toBe(true);
 await expect(page.locator('[role="alert"].form-error')).toContainText("server problem");
});


test("services and mentorship expose explicit empty and retryable API-failure states",async({page})=>{
 await mockApiResponse(page,"**/api/v1/services**",200,{data:{items:[]}});
 await page.goto("/services");
 await expect(page.getByRole("heading",{name:"No published services found"})).toBeVisible();
 await page.unroute("**/api/v1/services**");
 await mockApiResponse(page,"**/api/v1/services**",503,{error:{code:"SERVER_ERROR",message:"CI simulated services outage"}});
 let serviceFailureIntercepted=false;
 page.on("response",response=>{if(new URL(response.url()).pathname==="/api/v1/services"&&response.status()===503)serviceFailureIntercepted=true;});
 await page.getByRole("button",{name:"Retry"}).click();
 await expect.poll(()=>serviceFailureIntercepted,{message:"the services API failure fixture must intercept the real browser request"}).toBe(true);
 await expect(page.locator('[role="alert"].form-error')).toContainText("server problem");

 await mockApiResponse(page,"**/api/v1/mentors**",200,{data:[]});
 await page.goto("/mentorship");
 await expect(page.getByRole("heading",{name:"No active mentor profiles found"})).toBeVisible();
 await page.unroute("**/api/v1/mentors**");
 await mockApiResponse(page,"**/api/v1/mentors**",503,{error:{code:"SERVER_ERROR",message:"CI simulated mentorship outage"}});
 let mentorFailureIntercepted=false;
 page.on("response",response=>{if(new URL(response.url()).pathname==="/api/v1/mentors"&&response.status()===503)mentorFailureIntercepted=true;});
 await page.getByRole("button",{name:"Retry"}).click();
 await expect.poll(()=>mentorFailureIntercepted,{message:"the mentorship API failure fixture must intercept the real browser request"}).toBe(true);
 await expect(page.locator('[role="alert"].form-error')).toContainText("server problem");
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
   await page.locator(".case-row").filter({hasText:inquiry.public_reference}).getByRole("button",{name:"Save inquiry decision"}).click();
   await expect(page.getByRole("status")).toContainText("Inquiry decision saved");
   const listed=await api.get("/api/v1/opportunity-inquiries?type=job",{headers:{authorization:"Bearer "+token}});
   expect(listed.status()).toBe(200);
   expect((await listed.json()).data.some(row=>row.id===inquiry.id&&row.status==="contacted")).toBeTruthy();
   const outsider=await api.post("/api/v1/auth/register",{data:{email:"gate4-inquiry-outsider-"+randomUUID()+"@example.test",password:"gate4-outsider-password-12345",firstName:"No",lastName:"OrganizationScope"}});
   expect(outsider.status()).toBe(201);
   const unauthorized=await api.get("/api/v1/opportunity-inquiries?type=job",{headers:{authorization:"Bearer "+(await outsider.json()).data.token}});
   expect(unauthorized.status()).toBe(403,"accounts without organization scope cannot inspect private inquiries");
 }finally{await api.dispose();}
});

test("mentor eligibility, profile lifecycle, availability, match acceptance, sessions and feedback persist",async({page})=>{
 const {api,token:adminToken}=await apiContext();
 const mentor=await createActiveMember(api,"MENTOR");
 try{
   const adminMe=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+adminToken}});
   expect(adminMe.status()).toBe(200);
   const adminId=(await adminMe.json()).data.user_id;
   const mentorMe=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+mentor.token}});
   expect(mentorMe.status()).toBe(200);
   const mentorId=mentor.userId;
   const db=getPool();
   const product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
   expect(product).toBeTruthy();
   async function ensureActiveMembership(userId){
     const active=(await db.query("select id from membership_record where user_id=$1 and status='active' limit 1",[userId])).rows[0];
     if(active)return;
     const existing=(await db.query("select id from membership_record where user_id=$1 order by created_at desc limit 1",[userId])).rows[0];
     if(existing) await db.query("update membership_record set status='active',start_date=current_date,end_date=current_date+365 where id=$1",[existing.id]);
     else await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[userId,product.id,"G4-MENTOR-"+userId.slice(0,8)]);
   }
   await ensureActiveMembership(mentorId);
   await ensureActiveMembership(adminId);
   await addVerifiedProfessionalClaim(mentorId,"GATE4_MENTOR_FIXTURE");
   await browserLogin(page,mentor.email,mentor.password);
   await page.goto("/mentorship");
   await page.getByLabel("Mentor headline").fill("Gate 4 leadership mentor");
   await page.getByLabel("Bio").fill("Automated test fixture for verified professional mentorship.");
   await page.getByLabel("Expertise topics").fill("leadership, coaching");
   await page.getByLabel("Languages").fill("Amharic, English");
   await page.getByLabel("Mentoring modes").fill("remote");
   await page.getByLabel("Visibility").selectOption("members");
   await page.getByLabel("Maximum active mentees").fill("3");
   await page.getByRole("button",{name:"Create mentor profile"}).click();
   await expect(page.getByRole("status")).toContainText("Mentor profile saved");
   const ownProfile=await api.get("/api/v1/me/mentor-profile",{headers:{authorization:"Bearer "+mentor.token}});
   expect(ownProfile.status()).toBe(200);
   const profile=(await ownProfile.json()).data;
   expect(profile.status).toBe("draft","saving a profile must not implicitly activate it");
   const invalidAvailability=await api.put("/api/v1/mentor-profiles/"+profile.id+"/availability",{headers:{authorization:"Bearer "+mentor.token},data:{slots:[{dayOfWeek:1,startTime:"13:00",endTime:"09:00",timezone:"Africa/Addis_Ababa"}]}});
   expect(invalidAvailability.status()).toBe(400);
   await page.getByLabel("Day").selectOption("1");
   await page.getByLabel("From").fill("09:00");
   await page.getByLabel("Until").fill("12:00");
   await page.getByRole("button",{name:"Save availability"}).click();
   await expect(page.getByRole("status")).toContainText("Mentor availability saved");
   await page.getByRole("button",{name:"Activate profile"}).click();
   await expect(page.getByText("active",{exact:true}).first()).toBeVisible();
   const anonymousMentors=await api.get("/api/v1/mentors");
   expect(anonymousMentors.status()).toBe(200);
   expect((await anonymousMentors.json()).data.some(row=>row.user_id===mentorId)).toBeFalsy();
   const memberMentors=await api.get("/api/v1/mentors",{headers:{authorization:"Bearer "+adminToken}});
   expect(memberMentors.status()).toBe(200);
   expect((await memberMentors.json()).data.some(row=>row.user_id===mentorId)).toBeTruthy();
   const requestResponse=await api.post("/api/v1/mentorship/requests",{headers:{authorization:"Bearer "+adminToken},data:{goals:"Build practical leadership and coaching skills.",topics:["leadership"],preferredModes:["remote"],preferredLanguages:["amharic"],preferredDays:[1]}});
   expect(requestResponse.status()).toBe(201);
   const request=(await requestResponse.json()).data;
   const candidates=await api.get("/api/v1/mentorship/requests/"+request.id+"/matches",{headers:{authorization:"Bearer "+adminToken}});
   expect(candidates.status()).toBe(200);
   expect((await candidates.json()).data.some(row=>row.mentorUserId===mentorId)).toBeTruthy();
   const proposal=await api.post("/api/v1/mentorship/requests/"+request.id+"/match",{headers:{authorization:"Bearer "+adminToken},data:{mentorUserId:mentorId}});
   expect(proposal.status()).toBe(201);
   await page.reload();
   const invitation=page.locator(".case-row").filter({hasText:"Build practical leadership and coaching skills."});
   await expect(invitation.getByRole("button",{name:"Accept match"})).toBeVisible();
   await invitation.getByRole("button",{name:"Accept match"}).click();
   await expect(page.getByRole("status")).toContainText("Mentorship match accepted");
   const engagementsResponse=await api.get("/api/v1/me/mentorships",{headers:{authorization:"Bearer "+adminToken}});
   expect(engagementsResponse.status()).toBe(200);
   const engagement=(await engagementsResponse.json()).data.find(row=>row.mentor_user_id===mentorId&&row.mentee_user_id===adminId);
   expect(engagement,"accepted match creates one participant-scoped engagement").toBeTruthy();
   const start=new Date();
   start.setUTCHours(7,0,0,0);
   let daysUntilMonday=(1-start.getUTCDay()+7)%7;
   if(daysUntilMonday===0)daysUntilMonday=7;
   start.setUTCDate(start.getUTCDate()+daysUntilMonday);
   const end=new Date(start.getTime()+60*60*1000);
   const sessionResponse=await api.post("/api/v1/mentorship/"+engagement.id+"/sessions",{headers:{authorization:"Bearer "+mentor.token},data:{scheduledStartAt:start.toISOString(),scheduledEndAt:end.toISOString(),mode:"remote",agenda:"Gate 4 persisted session"}});
   expect(sessionResponse.status(),"session must fit published mentor availability").toBe(201);
   const session=(await sessionResponse.json()).data;
   const unauthorizedSessions=await api.get("/api/v1/mentorship/"+engagement.id+"/sessions",{headers:{authorization:"Bearer "+(await independentReviewerToken(api,adminToken))}});
   expect(unauthorizedSessions.status()).toBe(403);
   const earlyFeedback=await api.post("/api/v1/mentorship/"+engagement.id+"/feedback",{headers:{authorization:"Bearer "+adminToken},data:{targetRole:"mentor",rating:5,sessionId:session.id,comments:"Must wait for completion."}});
   expect(earlyFeedback.status()).toBe(409);
   const completed=await api.post("/api/v1/mentorship/sessions/"+session.id+"/status",{headers:{authorization:"Bearer "+mentor.token},data:{status:"completed",notes:"Session completed in Gate 4 E2E."}});
   expect(completed.status()).toBe(200);
   const feedback=await api.post("/api/v1/mentorship/"+engagement.id+"/feedback",{headers:{authorization:"Bearer "+adminToken},data:{targetRole:"mentor",rating:5,sessionId:session.id,comments:"Useful, actionable session."}});
   expect(feedback.status()).toBe(201);
   const close=await api.post("/api/v1/mentor-profiles/"+profile.id+"/status",{headers:{authorization:"Bearer "+mentor.token},data:{status:"closed"}});
   expect(close.status()).toBe(200);
   const reopen=await api.post("/api/v1/me/mentor-profile",{headers:{authorization:"Bearer "+mentor.token},data:{headline:"Attempt to reopen closed profile"}});
   expect(reopen.status()).toBe(409,"closed mentor profiles cannot be reopened through create/upsert");
 }finally{await api.dispose();await closePool();}
});

test("talent directory uses live consent-scoped profiles and inquiry contact-release lifecycle",async({page})=>{
 const {api,token:adminToken}=await apiContext();
 const professional=await createActiveMember(api,"TALENT");
 try{
   const me=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+professional.token}});
   expect(me.status()).toBe(200);
   const professionalId=(await me.json()).data.user_id;
   const displayName=(await me.json()).data.display_name;
   await addVerifiedProfessionalClaim(professionalId,"GATE4_TALENT_FIXTURE");
   const profileSave=await api.patch("/api/v1/me/talent-profile",{headers:{authorization:"Bearer "+professional.token},data:{professionalTitle:"Gate 4 talent discovery specialist",headline:"Gate 4 talent discovery fixture",bio:"Profile for consent-controlled directory acceptance.",directorySummary:"Live profile fixture; no private evidence is exposed.",yearsExperience:8,availabilityStatus:"available",locationLabel:"Addis Ababa",visibility:"public"}});
   expect(profileSave.status()).toBe(200);
   const consent=await api.patch("/api/v1/me/talent-visibility",{headers:{authorization:"Bearer "+professional.token},data:{directoryVisible:true,showIdentityBadge:false,showProfessionalBadge:true,showExperienceBadge:false,showLocation:false,showExperience:true,showContact:true}});
   expect(consent.status()).toBe(200);
   const anonymousSearch=await api.get("/api/v1/talent?q=Gate%204%20talent%20discovery");
   expect(anonymousSearch.status()).toBe(200);
   expect((await anonymousSearch.json()).data.items.some(row=>row.user_id===professionalId)).toBeTruthy();
   const memberHeaders={authorization:"Bearer "+professional.token};
   const hiddenByTitle=await api.get("/api/v1/talent?q=Gate%204%20talent%20discovery",{headers:memberHeaders});
   expect(hiddenByTitle.status()).toBe(200);
   const hiddenTalent=(await hiddenByTitle.json()).data.items.find(row=>row.user_id===professionalId);
   expect(hiddenTalent,"eligible talent should be discoverable without exposing hidden location").toBeTruthy();
   expect(hiddenTalent.show_location).toBe(false);
   expect(hiddenTalent.location_label).toBeNull();
   const hiddenLocationSearch=await api.get("/api/v1/talent?location=Addis%20Ababa",{headers:memberHeaders});
   expect(hiddenLocationSearch.status()).toBe(200);
   expect((await hiddenLocationSearch.json()).data.items.some(row=>row.user_id===professionalId)).toBe(false,"hidden location must not influence directory results");
   const locationConsent=await api.patch("/api/v1/me/talent-visibility",{headers:memberHeaders,data:{directoryVisible:true,showIdentityBadge:false,showProfessionalBadge:true,showExperienceBadge:false,showLocation:true,showExperience:true,showContact:true}});
   expect(locationConsent.status()).toBe(200);
   const visibleByTitle=await api.get("/api/v1/talent?q=Gate%204%20talent%20discovery",{headers:memberHeaders});
   const visibleTalent=(await visibleByTitle.json()).data.items.find(row=>row.user_id===professionalId);
   expect(visibleTalent.show_location).toBe(true);
   expect(visibleTalent.location_label).toBe("Addis Ababa");
   await browserLogin(page);
   await page.goto("/network");
   await page.getByPlaceholder("Professional title, headline or summary").fill("Gate 4 talent discovery");
   await page.getByRole("button",{name:"Search professionals"}).click();
   await expect(page.getByRole("heading",{name:displayName,exact:true})).toBeVisible();
   await page.getByRole("button",{name:"View professional profile"}).click();
   await expect(page.getByText("Gate 4 talent discovery fixture",{exact:true})).toBeVisible();
   await page.getByLabel("Saved search name").fill("Gate 4 live talent search");
   await page.getByRole("button",{name:"Save search"}).click();
   await expect(page.getByRole("status")).toContainText("Talent search saved");
   await page.getByLabel("Subject").fill("Gate 4 opportunity inquiry");
   await page.getByLabel("Message").fill("Please discuss an opportunity that fits the verified professional profile.");
   await page.getByRole("button",{name:"Send opportunity inquiry"}).click();
   await expect(page.getByRole("status")).toContainText("professional inquiry was recorded");
   const duplicate=await api.post("/api/v1/talent/inquiries",{headers:{authorization:"Bearer "+adminToken},data:{professionalUserId:professionalId,subject:"Gate 4 opportunity inquiry",message:"Duplicate pending inquiry."}});
   expect(duplicate.status()).toBe(409);
   const beforeResponse=await api.get("/api/v1/talent/inquiries",{headers:{authorization:"Bearer "+adminToken}});
   expect(beforeResponse.status()).toBe(200);
   const adminIdentity=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+adminToken}});
   expect(adminIdentity.status()).toBe(200);
   const adminId=(await adminIdentity.json()).data.user_id;
   const inquiry=(await beforeResponse.json()).data.find(row=>row.subject==="Gate 4 opportunity inquiry"&&row.requester_user_id===adminId);
   expect(inquiry).toBeTruthy();
   expect(inquiry.contact_release).toBeFalsy();
   await api.patch("/api/v1/me/talent-visibility",{headers:{authorization:"Bearer "+professional.token},data:{showContact:false}});
   const blockedRelease=await api.post("/api/v1/talent/inquiries/"+inquiry.id+"/response",{headers:{authorization:"Bearer "+professional.token},data:{status:"accepted",releaseContact:true}});
   expect(blockedRelease.status(),"a release request cannot override the professional's saved consent").toBe(409);
   await api.patch("/api/v1/me/talent-visibility",{headers:{authorization:"Bearer "+professional.token},data:{showContact:true}});
   await page.getByRole("button",{name:"Logout"}).click();
   await browserLogin(page,professional.email,professional.password);
   await page.goto("/network");
   const incoming=page.locator(".case-row").filter({hasText:"Gate 4 opportunity inquiry"});
   await expect(incoming.getByRole("button",{name:"Accept and release contact"})).toBeVisible();
   await incoming.getByRole("button",{name:"Accept and release contact"}).click();
   await expect(page.getByRole("status")).toContainText("Inquiry accepted. Contact release was explicitly approved.");
   const afterResponse=await api.get("/api/v1/talent/inquiries",{headers:{authorization:"Bearer "+adminToken}});
   expect(afterResponse.status()).toBe(200);
   const accepted=(await afterResponse.json()).data.find(row=>row.id===inquiry.id);
   expect(accepted.status).toBe("accepted");
   expect(accepted.contact_release).toBeTruthy();
   expect(typeof accepted.professional_email).toBe("string");
   const memberOnly=await api.patch("/api/v1/me/talent-profile",{headers:{authorization:"Bearer "+professional.token},data:{visibility:"members"}});
   expect(memberOnly.status()).toBe(200);
   const hiddenFromPublic=await api.get("/api/v1/talent?q=Gate%204%20talent%20discovery");
   expect(hiddenFromPublic.status()).toBe(200);
   expect((await hiddenFromPublic.json()).data.items.some(row=>row.user_id===professionalId)).toBeFalsy();
   const visibleToMember=await api.get("/api/v1/talent?q=Gate%204%20talent%20discovery",{headers:{authorization:"Bearer "+adminToken}});
   expect(visibleToMember.status()).toBe(200);
   expect((await visibleToMember.json()).data.items.some(row=>row.user_id===professionalId)).toBeTruthy();
 }finally{await api.dispose();await closePool();}
});

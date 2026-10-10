import { test, expect, request as playwrightRequest } from "@playwright/test";
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
async function createVerifiedOrganization(api,token,prefix){
  const suffix=Date.now()+"-"+Math.random().toString(16).slice(2);
  const name=prefix+" "+suffix;
  const headers={authorization:"Bearer "+token};
  const created=await api.post("/api/v1/organizations",{headers,data:{legalName:name,displayName:name,organizationType:"company"}});
  expect(created.status(),"organization creation").toBe(201);
  const organization=(await created.json()).data;
  const submitted=await api.post("/api/v1/organizations/"+organization.id+"/submit-verification",{headers});
  expect(submitted.status(),"organization verification submission").toBe(200);
  const reviewed=await api.post("/api/v1/review/organizations",{headers,data:{organizationId:organization.id,decision:"verified",reason:"Browser E2E fixture"}});
  expect(reviewed.status(),"organization verification decision").toBe(200);
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
    await page.getByRole("button",{name:"Submit for verification"}).first().click();
    await expect(page.getByRole("status")).toContainText("Verification submission was accepted by the server.");
    const detail=await api.get("/api/v1/organizations/"+organization.id,{headers:{authorization:"Bearer "+token}});
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.verification_status).toBe("pending");
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
  }finally{await api.dispose();}
});

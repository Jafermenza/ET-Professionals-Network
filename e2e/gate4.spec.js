import { test, expect, request as playwrightRequest } from "@playwright/test";

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
    await page.addInitScript(value=>sessionStorage.setItem("mpa-session-token",value),token);
    await page.goto("/jobs");
    await page.getByPlaceholder("Search job title or description").fill(title);
    await page.getByRole("button",{name:"Apply filters"}).click();
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Save opportunity"}).click();
    await expect(page.getByRole("status")).toContainText("Opportunity saved to your account.");
    await page.reload();
    await expect(page.getByRole("button",{name:"Remove saved opportunity"})).toBeVisible();
    await page.getByRole("button",{name:"Save job alert"}).click();
    await expect(page.getByRole("status")).toContainText("daily in-app job alert was saved");
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
    await page.addInitScript(value=>sessionStorage.setItem("mpa-session-token",value),token);
    await page.goto("/organizations");
    await page.getByLabel("Organization").selectOption(organization.id);
    await page.getByLabel("Private document").setInputFiles({
      name:"registration-evidence.pdf",
      mimeType:"application/pdf",
      buffer:Buffer.from("%PDF-1.7\nBrowser private evidence fixture\n%%EOF")
    });
    await page.getByRole("button",{name:"Upload and attach private evidence"}).click();
    await expect(page.getByRole("status")).toContainText("Private evidence uploaded, checksum-verified and attached");
    await page.getByRole("button",{name:"Submit for verification"}).first().click();
    await expect(page.getByRole("status")).toContainText("Verification submission was accepted by the server.");
    const detail=await api.get("/api/v1/organizations/"+organization.id,{headers:{authorization:"Bearer "+token}});
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.verification_status).toBe("pending");
  }finally{await api.dispose();}
});

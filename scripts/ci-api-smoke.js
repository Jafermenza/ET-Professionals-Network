import assert from "node:assert/strict";
import { getPool } from "../src/platform/db.js";

const base=process.env.CI_API_BASE_URL||"http://127.0.0.1:3000";
const email=process.env.BOOTSTRAP_ADMIN_EMAIL;
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!email||!password) throw new Error("CI smoke credentials are not configured.");

async function request(path,{method="GET",token,body,headers:extraHeaders}={}){
  const response=await fetch(base+path,{
    method,
    headers:{
      ...(body?{"content-type":"application/json"}:{}),
      ...(token?{authorization:"Bearer "+token}:{}),...(extraHeaders||{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  return {status:response.status,payload};
}

async function rawRequest(path,{method="GET",token,body,headers:extraHeaders}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:"Bearer "+token}:{}),...(extraHeaders||{})},...(body!==undefined?{body}:{})});
  const text=await response.text();let payload=null;try{payload=JSON.parse(text)}catch{}
  return {status:response.status,payload,text};
}

const publicMentors=await request("/api/v1/mentors");
assert.equal(publicMentors.status,200,"public mentor discovery should work without a session");
assert.ok(Array.isArray(publicMentors.payload?.data),"public mentor discovery should return an array");

let login;
for(let attempt=0;attempt<20;attempt++){
  login=await request("/api/v1/auth/login",{method:"POST",body:{email,password}});
  if(login.status===200) break;
  await new Promise(resolve=>setTimeout(resolve,250));
}
assert.equal(login.status,200,"bootstrap administrator should be able to log in after startup");
const token=login.payload?.data?.token;
assert.equal(typeof token,"string","login response must include a session token");

const me=await request("/api/v1/me",{token});
assert.equal(me.status,200,"authenticated profile endpoint should return success");
assert.equal(me.payload?.data?.email,email,"profile endpoint should return the authenticated account");
assert.equal(me.payload?.data?.status,"active","profile endpoint should return account status");
assert.equal(typeof me.payload?.data?.user_id,"string","profile endpoint should return its user_id contract");

const memberMentors=await request("/api/v1/mentors",{token});
assert.equal(memberMentors.status,200,"authenticated mentor discovery should return successfully");
assert.ok(Array.isArray(memberMentors.payload?.data),"authenticated mentor discovery should return an array");

const uploadBytes=Buffer.from("%PDF-1.7\\nCI private evidence fixture\\n%%EOF");
const uploadAuthorization=await request("/api/v1/files/uploads",{method:"POST",token,body:{fileName:"ci-evidence.pdf",contentType:"application/pdf",byteSize:uploadBytes.length}});
assert.equal(uploadAuthorization.status,201,"authenticated users should receive a bounded private upload authorization");
const upload=uploadAuthorization.payload?.data;
assert.equal(typeof upload?.uploadToken,"string","upload authorization should include a one-use token");
const badUpload=await rawRequest(upload.uploadUrl,{method:"PUT",token,body:uploadBytes,headers:{"content-type":"application/octet-stream","x-upload-token":"invalid-token"}});
assert.equal(badUpload.status,403,"invalid upload tokens must be rejected");
const uploadResult=await rawRequest(upload.uploadUrl,{method:"PUT",token,body:uploadBytes,headers:{"content-type":"application/octet-stream","x-upload-token":upload.uploadToken}});
assert.equal(uploadResult.status,201,"authorized upload bytes should be accepted");
assert.equal(uploadResult.payload?.data?.checksumSha256, (await import("node:crypto")).createHash("sha256").update(uploadBytes).digest("hex"),"upload checksum must be server-calculated");
const confirmed=await request("/api/v1/files/uploads/"+upload.uploadId+"/confirm",{method:"POST",token});
assert.equal(confirmed.status,201,"uploaded evidence should be confirmed into a private file object");
assert.equal(confirmed.payload?.data?.visibility,"private","confirmed evidence must remain private");
const fileContent=await rawRequest("/api/v1/files/"+confirmed.payload.data.id,{token});
assert.equal(fileContent.status,200,"file owner should be able to read their private upload");
assert.equal(fileContent.text,uploadBytes.toString(),"private file download must return the exact verified bytes");
const secondUpload=await rawRequest(upload.uploadUrl,{method:"PUT",token,body:uploadBytes,headers:{"content-type":"application/octet-stream","x-upload-token":upload.uploadToken}});
assert.equal(secondUpload.status,409,"upload authorization must not be reusable");

const db=getPool();
const membershipProduct=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
assert.ok(membershipProduct,"CI must have a membership product fixture");
const memberEmail="ci-gate4-"+Date.now()+"@example.test";
const registration=await request("/api/v1/auth/register",{method:"POST",body:{email:memberEmail,password:"ci-gate4-password-12345",firstName:"Gate4",lastName:"Member"+Date.now()}});
assert.equal(registration.status,201,"CI should be able to register a separate workflow participant");
const memberToken=registration.payload?.data?.token;
const memberId=registration.payload?.data?.user?.id;
assert.equal(typeof memberToken,"string","registration should return a session token");
assert.equal(typeof memberId,"string","registration should return the new user id");
await db.query("insert into person(user_id,first_name,last_name,display_name) values($1,'Gate4','Administrator','Gate4 Administrator') on conflict(user_id) do nothing",[me.payload.data.user_id]);
for(const userId of [me.payload.data.user_id,memberId]){
  const active=(await db.query("select id from membership_record where user_id=$1 and status='active' limit 1",[userId])).rows[0];
  if(!active) await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[userId,membershipProduct.id,"CI-"+userId.slice(0,8)+"-"+Date.now()]);
}
const orgName="Gate 4 CI Organization "+Date.now();
const orgCreated=await request("/api/v1/organizations",{method:"POST",token,body:{legalName:orgName,displayName:orgName,organizationType:"company"}});
assert.equal(orgCreated.status,201,"organization registration should create a scoped owner membership");
const organizationId=orgCreated.payload?.data?.id;
assert.equal(typeof organizationId,"string","organization registration should return its identifier");
const attachedEvidence=await request("/api/v1/organizations/"+organizationId+"/verification-evidence",{method:"POST",token,body:{fileObjectId:confirmed.payload.data.id,evidenceType:"registration_document",note:"CI-only private upload contract test"}});
assert.equal(attachedEvidence.status,201,"organization owner should be able to attach their own confirmed private upload");
const evidenceForbidden=await request("/api/v1/files/"+confirmed.payload.data.id,{token:memberToken});
assert.equal(evidenceForbidden.status,403,"an unrelated member must not read private organization evidence");
const verificationSubmitted=await request("/api/v1/organizations/"+organizationId+"/submit-verification",{method:"POST",token});
assert.equal(verificationSubmitted.status,200,"organization verification should submit after evidence is attached");
const verificationReviewed=await request("/api/v1/review/organizations",{method:"POST",token,body:{organizationId,decision:"verified",reason:"CI workflow acceptance"}});
assert.equal(verificationReviewed.status,200,"authorized reviewer should decide organization verification");
const jobTitle="Gate 4 persisted job "+Date.now();
const jobCreated=await request("/api/v1/jobs",{method:"POST",token,body:{organizationId,title:jobTitle,description:"CI-only public job for workflow integration",postingScope:"public",visibility:"public"}});
assert.equal(jobCreated.status,201,"verified organization owner should create a job");
const jobId=jobCreated.payload?.data?.id;
const jobPublished=await request("/api/v1/jobs/"+jobId+"/publish",{method:"POST",token});
assert.equal(jobPublished.status,200,"verified organization owner should publish the job");
const publicJobs=await request("/api/v1/jobs?q="+encodeURIComponent(jobTitle));
assert.equal(publicJobs.status,200,"public job discovery should return successfully");
assert.ok((publicJobs.payload?.data?.items||[]).some(j=>j.id===jobId),"published job must be discoverable from persisted data");
const saved=await request("/api/v1/jobs/"+jobId+"/save",{method:"POST",token:memberToken});
assert.ok(saved.status===200||saved.status===201,"authenticated user should be able to save a public job");
const savedList=await request("/api/v1/me/saved-jobs",{token:memberToken});
assert.ok(savedList.status===200&&(savedList.payload?.data||[]).some(j=>j.id===jobId),"saved-job state must persist and be visible to its owner");
const unsaved=await request("/api/v1/jobs/"+jobId+"/save",{method:"DELETE",token:memberToken});
assert.equal(unsaved.status,200,"saved job should be removable");
const afterUnsave=await request("/api/v1/me/saved-jobs",{token:memberToken});
assert.ok(!(afterUnsave.payload?.data||[]).some(j=>j.id===jobId),"unsave must persist");
const alertCreated=await request("/api/v1/me/job-alerts",{method:"POST",token:memberToken,body:{name:"Gate 4 CI alert",criteria:{q:jobTitle},frequency:"daily",channel:"in_app"}});
assert.equal(alertCreated.status,201,"job alert criteria should be persisted");
const alerts=await request("/api/v1/me/job-alerts",{token:memberToken});
assert.ok((alerts.payload?.data||[]).some(a=>a.id===alertCreated.payload?.data?.id),"job alert should be visible to its creator");

const listing=await request("/api/v1/services",{method:"GET"});
assert.equal(listing.status,200,"published service discovery should be available");
const serviceCreated=await request("/api/v1/services",{method:"POST",token,body:{title:"Gate 4 CI advisory service",description:"CI-only service listing",serviceCategory:"advisory",pricingModel:"quote",visibility:"public"}});
assert.equal(serviceCreated.status,201,"active member should create a service listing");
const serviceId=serviceCreated.payload?.data?.id;
const servicePublished=await request("/api/v1/services/"+serviceId+"/status",{method:"POST",token,body:{status:"published"}});
assert.equal(servicePublished.status,200,"provider should publish the service");
const discoveredServices=await request("/api/v1/services?q="+encodeURIComponent("Gate 4 CI advisory service"));
assert.ok((discoveredServices.payload?.data?.items||[]).some(x=>x.id===serviceId),"published service should be discoverable");
const selfRequest=await request("/api/v1/services/"+serviceId+"/requests",{method:"POST",token,body:{message:"self-request must fail"}});
assert.equal(selfRequest.status,409,"provider must not request their own service");
const serviceRequest=await request("/api/v1/services/"+serviceId+"/requests",{method:"POST",token:memberToken,body:{message:"CI-only request"}});
assert.equal(serviceRequest.status,201,"another active member should be able to request a published service");
const serviceRequestId=serviceRequest.payload?.data?.id;
const duplicateRequest=await request("/api/v1/services/"+serviceId+"/requests",{method:"POST",token:memberToken,body:{message:"duplicate should fail"}});
assert.equal(duplicateRequest.status,409,"duplicate active service requests must be rejected");
const requesterAcceptDenied=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token:memberToken,body:{status:"accepted"}});
assert.equal(requesterAcceptDenied.status,403,"requester cannot impersonate provider acceptance");
const providerAccept=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token,body:{status:"accepted"}});
assert.equal(providerAccept.status,200,"provider should accept their own service request");
const providerStart=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token,body:{status:"in_progress"}});
assert.equal(providerStart.status,200,"provider should start an accepted service request");
const providerComplete=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token,body:{status:"completed",note:"Delivery submitted"}});
assert.equal(providerComplete.status,200,"provider completion should be recorded without bypassing requester acceptance");
const prematureList=await request("/api/v1/me/service-requests",{token:memberToken});
assert.ok((prematureList.payload?.data||[]).some(r=>r.id===serviceRequestId&&r.provider_completed_at),"requester should see the provider completion submission");
const requesterAccept=await request("/api/v1/service-requests/"+serviceRequestId+"/accept-completion",{method:"POST",token:memberToken,body:{note:"CI outcome accepted"}});
assert.equal(requesterAccept.status,200,"requester should explicitly accept the completed delivery");

const mentorshipRequest=await request("/api/v1/mentorship/requests",{method:"POST",token:memberToken,body:{goals:"CI-only mentorship goal",topics:["career"],preferredModes:["remote"],preferredLanguages:["English"]}});
assert.equal(mentorshipRequest.status,201,"active member should be able to persist an explicit mentorship request");
const mentorshipRequestId=mentorshipRequest.payload?.data?.id;
const matches=await request("/api/v1/mentorship/requests/"+mentorshipRequestId+"/matches",{token:memberToken});
assert.equal(matches.status,200,"mentorship request owner should be able to inspect match results");
const persistedMentorship=(await db.query("select goals,status from mentorship_request where id=$1 and mentee_user_id=$2",[mentorshipRequestId,memberId])).rows[0];
assert.equal(persistedMentorship?.goals,"CI-only mentorship goal","mentorship request must persist its stated goal");
assert.equal(persistedMentorship?.status,"requested","request remains requested until matching and acceptance actions occur");
const unverifiedMentor=await request("/api/v1/me/mentor-profile",{method:"POST",token:memberToken,body:{headline:"Unverified CI mentor",expertise:["career"],languages:["English"],mentoringModes:["remote"]}});
assert.equal(unverifiedMentor.status,403,"mentor activation must require an eligible verified professional claim");

const logout=await request("/api/v1/auth/logout",{method:"POST",token});
assert.equal(logout.status,200,"logout should revoke the current session");
const afterLogout=await request("/api/v1/me",{token});
assert.equal(afterLogout.status,401,"revoked session must not access authenticated profile data");

console.log("API smoke passed: jobs publication/search/save/alerts, organization evidence privacy, services request and acceptance lifecycle, mentorship request persistence/eligibility, private upload validation, and session lifecycle.");

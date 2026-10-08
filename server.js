import http from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./src/platform/config.js";
import { createLogger } from "./src/platform/logger.js";
import { verifyToken, requireRole } from "./src/platform/auth.js";
import * as membership from "./src/membership/service.js";
import * as verification from "./src/verification/service.js";
import * as talent from "./src/talent/service.js";
import * as organizationJobs from "./src/organization-jobs/service.js";

const config=loadConfig();
const logger=createLogger({level:config.logLevel});

function json(res,status,body,requestId){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","x-request-id":requestId,"cache-control":"no-store"});
  res.end(JSON.stringify(body));
}
function pathParts(url){ return new URL(url,"http://localhost").pathname.split("/").filter(Boolean); }
function query(url){ return new URL(url,"http://localhost").searchParams; }
async function body(req){
  let raw="";
  for await (const chunk of req) {
    raw+=chunk;
    if(Buffer.byteLength(raw)>1024*1024) throw Object.assign(new Error("Request body too large."),{statusCode:413,code:"PAYLOAD_TOO_LARGE"});
  }
  if(!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Request body must be valid JSON."),{statusCode:400,code:"INVALID_JSON"}); }
}
function auth(req){
  if(!config.jwtSecret) throw Object.assign(new Error("Authentication secret is not configured."),{statusCode:503,code:"AUTH_NOT_CONFIGURED"});
  const header=req.headers.authorization||"";
  if(!header.startsWith("Bearer ")) throw Object.assign(new Error("Bearer authentication required."),{statusCode:401,code:"UNAUTHENTICATED"});
  try { return verifyToken(header.slice(7),config.jwtSecret); }
  catch(e){ throw Object.assign(new Error(e.message),{statusCode:e.statusCode===403?403:401,code:"UNAUTHENTICATED"}); }
}
function anyRole(identity,allowed){
  if(!allowed.some(role=>Array.isArray(identity.roles)&&identity.roles.includes(role))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
  return identity;
}
function ok(res,data,requestId,status=200){ return json(res,status,{data},requestId); }

const server=http.createServer(async (req,res)=>{
  const requestId=req.headers["x-request-id"]||randomUUID();
  res.on("finish",()=>logger.info("http.request",{requestId,method:req.method,path:req.url,status:res.statusCode}));
  try {
    if(req.method==="GET" && req.url==="/healthz") return ok(res,{status:"ok"},requestId);
    if(req.method==="GET" && req.url==="/readyz") return ok(res,{status:"ready",databaseConfigured:Boolean(config.databaseUrl)},requestId);
    const parts=pathParts(req.url);
    const p=parts.join("/");
    if(req.method==="GET" && p==="api/v1/jobs") { const q=query(req.url); return ok(res,await organizationJobs.listJobs({visibility:q.get("visibility"),q:q.get("q")}),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/jobs/")) return ok(res,await organizationJobs.getJob(parts[3]),requestId);

    if(req.method==="POST" && p==="api/v1/auth/register") return ok(res,await membership.register(await body(req),requestId),requestId,201);
    if(req.method==="POST" && p==="api/v1/auth/login") {
      const b=await body(req); return ok(res,await membership.login(b.email,b.password,requestId),requestId);
    }

    const identity=auth(req);
    if(req.method==="POST" && p==="api/v1/organizations") return ok(res,await organizationJobs.registerOrganization(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/organizations") return ok(res,await organizationJobs.listMyOrganizations(identity.sub),requestId);
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/organizations/")) return ok(res,await organizationJobs.getOrganization(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="verification-evidence") return ok(res,await organizationJobs.addVerificationEvidence(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="submit-verification") return ok(res,await organizationJobs.submitOrganizationVerification(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.addOrganizationUser(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.updateOrganizationUser(parts[3],identity.sub,parts[5],await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.listOrganizationUsers(parts[3],identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/review/organizations") { anyRole(identity,["reviewer","system_admin"]); const b=await body(req); return ok(res,await organizationJobs.reviewOrganization(b.organizationId,identity.sub,b,requestId),requestId); }

    if(req.method==="POST" && p==="api/v1/jobs") { const b=await body(req); if(!b.organizationId) throw Object.assign(new Error("organizationId is required."),{statusCode:400,code:"VALIDATION_ERROR"}); return ok(res,await organizationJobs.createJob(b.organizationId,identity.sub,b,requestId),requestId,201); }

    if(req.method==="GET" && p==="api/v1/me") return ok(res,await membership.getMe(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/profile") return ok(res,await membership.updateProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/membership/history") return ok(res,await membership.history(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub,await body(req)),requestId);
    if(req.method==="POST" && p==="api/v1/membership/applications") {
      requireRole(identity,"member"); return ok(res,await membership.createApplication(identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="review") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.reviewApplication(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="correction") {
      requireRole(identity,"member"); return ok(res,await membership.respondCorrection(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="attachments") {
      requireRole(identity,"member"); return ok(res,await membership.attachApplicationFile(parts[4],identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="payment") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.createManualPayment(parts[4],identity.sub,b,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="activate") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.activateApplication(parts[4],identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/membership/renew") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.renew(identity.sub,b.productCode,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="payments" && parts[4]==="verify") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.verifyPayment(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="GET" && p==="api/v1/review/membership/applications") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.listApplicationsForReview(),requestId);
    }

    if(req.method==="PATCH" && p==="api/v1/me/talent-profile") return ok(res,await talent.updateProfessionalProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/talent-visibility") return ok(res,await talent.getVisibility(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/talent-visibility") return ok(res,await talent.updateVisibility(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/talent"){
      const q=query(req.url);
      return ok(res,await talent.searchTalent(identity.sub,{q:q.get("q"),occupation:q.get("occupation"),industry:q.get("industry"),educationLevel:q.get("educationLevel"),qualificationType:q.get("qualificationType"),fieldOfStudy:q.get("fieldOfStudy"),availability:q.get("availability"),location:q.get("location"),verifiedClaim:q.get("verifiedClaim"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/talent/")) return ok(res,await talent.getTalent(parts[3],identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/talent/saved-searches") return ok(res,await talent.saveSearch(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/talent/saved-searches") return ok(res,await talent.listSavedSearches(identity.sub),requestId);

    if(req.method==="POST" && p==="api/v1/verification/cases"){
      const b=await body(req);
      if(b.subjectUserId && b.subjectUserId!==identity.sub) anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      else requireRole(identity,"member");
      return ok(res,await verification.createCase(b.subjectUserId||identity.sub,b.programCode,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="consent"){ const b=await body(req); return ok(res,await verification.giveConsent(parts[3],identity.sub,b.consentVersion,requestId),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/verification/cases/")){
      const c=await verification.getCase(parts[3],identity.sub);
      return ok(res,c,requestId);
    }
    if(req.method==="GET" && p==="api/v1/review/verification/cases"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      const q=query(req.url);
      return ok(res,await verification.listCases({status:q.get("status"),programCode:q.get("programCode"),reviewerId:q.get("reviewerId"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="assign"){
      anyRole(identity,["verification_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.assignCase(parts[3],b.reviewerId,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="transition"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.transitionCase(parts[3],b.status,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="claims"){
      const b=await body(req); const c=await verification.getCase(parts[3]);
      if(c.subject_user_id!==identity.sub) anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      return ok(res,await verification.addClaim(parts[3],b.claimTypeCode,b.claimedValue,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="evidence"){
      const b=await body(req); const c=await verification.getCase(parts[3]);
      if(c.subject_user_id!==identity.sub) anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      return ok(res,await verification.addEvidence(parts[3],b,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="decision"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      return ok(res,await verification.decide(parts[3],await body(req),identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="response") return ok(res,await verification.memberResponse(parts[3],await body(req),identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/cases/") && parts[4]==="appeal") return ok(res,await verification.submitAppeal(parts[3],await body(req),identity.sub,requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/appeals/") && parts[4]==="decision"){
      anyRole(identity,["appeal_reviewer","system_admin"]);
      return ok(res,await verification.decideAppeal(parts[3],await body(req),identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="claim-status"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.setClaimStatus(parts[4],b.status,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="check-results"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.recordCheckResult(parts[4],b.checklistItemId,b,identity.sub,requestId),requestId);
    }

    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="eligibility") return ok(res,await organizationJobs.evaluateEligibility(parts[3],identity.sub),requestId);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/jobs/")) return ok(res,await organizationJobs.updateJob(parts[3],identity.sub,await body(req),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="publish") return ok(res,await organizationJobs.publishJob(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationJobs.changeJobStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="candidates") return ok(res,await organizationJobs.listCandidates(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="apply") return ok(res,await organizationJobs.applyToJob(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/job-applications") return ok(res,await organizationJobs.listMyApplications(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/jobs/") && parts[4]==="candidates") { return ok(res,await organizationJobs.updateCandidate(parts[3],parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="attachments") return ok(res,await organizationJobs.listApplicationAttachments(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="attachments") return ok(res,await organizationJobs.addApplicationAttachment(parts[3],identity.sub,await body(req),requestId),requestId,201);
    return json(res,404,{error:{code:"NOT_FOUND",message:"Route not found."}},requestId);
  } catch(error) {
    const status=error.statusCode||500;
    logger.error("http.error",{requestId,error:error.message,code:error.code,status});
    return json(res,status,{error:{code:error.code||"INTERNAL_ERROR",message:status>=500?"Internal server error.":error.message}},requestId);
  }
});
server.listen(config.port,config.host,()=>logger.info("server.started",{host:config.host,port:config.port,environment:config.nodeEnv}));
export { server };

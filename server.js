import http from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./src/platform/config.js";
import { createLogger } from "./src/platform/logger.js";
import { verifyToken, requireRole } from "./src/platform/auth.js";
import * as membership from "./src/membership/service.js";

const config=loadConfig();
const logger=createLogger({level:config.logLevel});

function json(res,status,body,requestId){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","x-request-id":requestId,"cache-control":"no-store"});
  res.end(JSON.stringify(body));
}
function pathParts(url){ return new URL(url,"http://localhost").pathname.split("/").filter(Boolean); }
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

    if(req.method==="POST" && p==="api/v1/auth/register") return ok(res,await membership.register(await body(req),requestId),requestId,201);
    if(req.method==="POST" && p==="api/v1/auth/login") {
      const b=await body(req); return ok(res,await membership.login(b.email,b.password,requestId),requestId);
    }

    const identity=auth(req);
    if(req.method==="GET" && p==="api/v1/me") return ok(res,await membership.getMe(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/profile") return ok(res,await membership.updateProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/membership/history") return ok(res,await membership.history(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/membership/applications") {
      requireRole(identity,"member"); return ok(res,await membership.createApplication(identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="review") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.reviewApplication(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="correction") {
      requireRole(identity,"member"); return ok(res,await membership.respondCorrection(parts[4],identity.sub,await body(req),requestId),requestId);
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
    return json(res,404,{error:{code:"NOT_FOUND",message:"Route not found."}},requestId);
  } catch(error) {
    const status=error.statusCode||500;
    logger.error("http.error",{requestId,error:error.message,code:error.code,status});
    return json(res,status,{error:{code:error.code||"INTERNAL_ERROR",message:status>=500?"Internal server error.":error.message}},requestId);
  }
});
server.listen(config.port,config.host,()=>logger.info("server.started",{host:config.host,port:config.port,environment:config.nodeEnv}));
export { server };

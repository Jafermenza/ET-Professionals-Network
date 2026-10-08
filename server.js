import http from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./src/platform/config.js";
import { createLogger } from "./src/platform/logger.js";
import { verifyToken, requireRole } from "./src/platform/auth.js";

const config=loadConfig();
const logger=createLogger({level:config.logLevel});
function json(res,status,body,requestId){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","x-request-id":requestId,"cache-control":"no-store"});
  res.end(JSON.stringify(body));
}
const server=http.createServer((req,res)=>{
  const requestId=req.headers["x-request-id"] || randomUUID();
  res.on("finish",()=>logger.info("http.request",{requestId,method:req.method,path:req.url,status:res.statusCode}));
  try {
    if(req.method==="GET" && req.url==="/healthz") return json(res,200,{status:"ok"},requestId);
    if(req.method==="GET" && req.url==="/readyz") return json(res,200,{status:"ready",databaseConfigured:Boolean(config.databaseUrl)},requestId);
    if(req.method==="GET" && req.url==="/api/v1/protected") {
      if(!config.jwtSecret) return json(res,503,{error:{code:"AUTH_NOT_CONFIGURED",message:"Authentication secret is not configured."}},requestId);
      const header=req.headers.authorization || "";
      if(!header.startsWith("Bearer ")) return json(res,401,{error:{code:"UNAUTHENTICATED",message:"Bearer authentication required."}},requestId);
      try {
        const identity=verifyToken(header.slice(7),config.jwtSecret);
        requireRole(identity,"member");
        return json(res,200,{data:{userId:identity.sub,roles:identity.roles}},requestId);
      } catch(e) {
        return json(res,e.statusCode===403?403:401,{error:{code:e.statusCode===403?"FORBIDDEN":"UNAUTHENTICATED",message:e.message}},requestId);
      }
    }
    return json(res,404,{error:{code:"NOT_FOUND",message:"Route not found."}},requestId);
  } catch(error) {
    logger.error("http.error",{requestId,error:error.message});
    return json(res,500,{error:{code:"INTERNAL_ERROR",message:"Internal server error."}},requestId);
  }
});
server.listen(config.port,config.host,()=>logger.info("server.started",{host:config.host,port:config.port,environment:config.nodeEnv}));
export { server };

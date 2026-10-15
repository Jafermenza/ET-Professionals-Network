import {test,expect,request as playwrightRequest} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {getPool,closePool} from "../src/platform/db.js";
import * as membership from "../src/membership/service.js";
import {hashSecurityToken} from "../src/platform/security-controls.js";

const API_BASE=process.env.API_BASE_URL||"http://127.0.0.1:3000";
const suffix=randomUUID().replace(/-/g,"").slice(0,12);
const createdUsers=[];
async function createActor(roleCode){
 const email="security-e2e-"+roleCode+"-"+suffix+"@example.test";
 const registered=await membership.register({email,password:"Security-e2e-password-12345",firstName:"Security",lastName:roleCode+suffix,phone:"09"+String(Date.now()).slice(-8)},"security-e2e-register");
 createdUsers.push(registered.user.id);
 await getPool().query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code=$2 on conflict do nothing",[registered.user.id,roleCode]);
 return {email,userId:registered.user.id,token:registered.token};
}

test("non-admins cannot enroll passkeys and malformed WebAuthn responses are rejected",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 const member=await createActor("member");
 const admin=await createActor("system_admin");
 try{
  const denied=await api.post("/api/v1/admin/passkeys/registration/options",{headers:{authorization:"Bearer "+member.token}});
  expect(denied.status()).toBe(403);
  const malformed=await api.post("/api/v1/admin/passkeys/registration/verify",{headers:{authorization:"Bearer "+admin.token},data:{id:"not-a-credential",rawId:"not-a-credential",response:{}}});
  expect(malformed.status()).toBe(400);
 }finally{await api.dispose();}
});

test("revoked credentials are excluded from passkey login",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 const admin=await createActor("system_admin");
 const db=getPool();
 try{
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[admin.userId]);
  await db.query("insert into admin_passkey_credential(user_id,credential_id,public_key_jwk,revoked_at) values($1,$2,$3,now())",[admin.userId,"revoked-"+suffix,{kty:"EC",crv:"P-256",x:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",y:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]);
  const result=await api.post("/api/v1/auth/passkeys/options",{data:{email:admin.email}});
  expect(result.status()).toBe(401);
  expect((await result.json()).error?.code||(await result.json()).data?.error?.code).toBeTruthy();
 }finally{await api.dispose();}
});

test("password sessions cannot bypass passkey enforcement; recovery sessions stay restricted and codes are one-time",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 const admin=await createActor("system_admin");
 const db=getPool();
 const code="RECOVERY-"+suffix.toUpperCase();
 try{
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[admin.userId]);
  await db.query("insert into admin_passkey_recovery_code(user_id,code_hash) values($1,$2)",[admin.userId,hashSecurityToken(code)]);
  const passwordBypass=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+admin.token}});
  expect(passwordBypass.status()).toBe(401);
  const recovery=await api.post("/api/v1/auth/passkeys/recovery",{data:{email:admin.email,code}});
  expect(recovery.status()).toBe(200);
  const recoveryToken=(await recovery.json()).data.token;
  const restricted=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+recoveryToken}});
  expect(restricted.status()).toBe(401);
  const replay=await api.post("/api/v1/auth/passkeys/recovery",{data:{email:admin.email,code}});
  expect(replay.status()).toBe(401);
 }finally{await api.dispose();}
});

test.afterAll(async()=>{
 const db=getPool();
 for(const userId of createdUsers)await db.query("delete from app_user where id=$1",[userId]);
 await closePool();
});

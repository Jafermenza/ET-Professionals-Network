import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool, withTransaction } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import { issueHumanChallenge, verifyHumanChallenge, consumeHumanChallenge, enforcePersistentRateLimit, hashSecurityToken } from "../../src/platform/security-controls.js";
import { recoverAdminPasskey } from "../../src/platform/webauthn.js";
import { createEmailVerification, verifyEmailToken } from "../../src/platform/email-verification.js";

const suffix=randomUUID().replace(/-/g,"").slice(0,12);
const createdUsers=[];

test("first-party human challenge rejects wrong answers and verified tokens are single-use",async()=>{
  const challenge=await issueHumanChallenge();
  const match=challenge.question.match(/(\d+)\s*([+−])\s*(\d+)/);
  assert.ok(match,"challenge uses a parseable arithmetic prompt");
  const a=Number(match[1]),b=Number(match[3]),answer=match[2]==="+"?a+b:a-b;
  await assert.rejects(verifyHumanChallenge(challenge.id,String(answer+97)),error=>error.code==="CHALLENGE_INCORRECT");
  const verified=await verifyHumanChallenge(challenge.id,String(answer));
  assert.equal(typeof verified.token,"string");
  await withTransaction(db=>consumeHumanChallenge(db,verified.token));
  await assert.rejects(withTransaction(db=>consumeHumanChallenge(db,verified.token)),error=>error.code==="CHALLENGE_INVALID");
});

test("persistent rate limits are shared by independent request objects",async()=>{
  const action="security-test-"+suffix;
  const requestA={headers:{},socket:{remoteAddress:"198.51.100.23"}};
  const requestB={headers:{},socket:{remoteAddress:"198.51.100.23"}};
  await enforcePersistentRateLimit(requestA,action,2,60000);
  await enforcePersistentRateLimit(requestB,action,2,60000);
  await assert.rejects(enforcePersistentRateLimit(requestA,action,2,60000),error=>error.code==="RATE_LIMITED"&&error.statusCode===429);
});

test("email verification is one-time and blocks unverified login",async()=>{
  const email="security-email-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-email-password-12345",firstName:"Security",lastName:"Email"+suffix,phone:"09"+randomUUID().replace(/\D/g,"").slice(0,8)},"security-email-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  assert.match(registered.registrationReference,/^MPA-MEM-\d{2}-\d{6,}$/);
  await db.query("update app_user set email_verified_at=null where id=$1",[userId]);
  const verification=await withTransaction(tx=>createEmailVerification(tx,userId,email,registered.registrationReference));
  const previous=process.env.EMAIL_VERIFICATION_REQUIRED;
  process.env.EMAIL_VERIFICATION_REQUIRED="true";
  try {
    await assert.rejects(membership.login(email,"Security-email-password-12345","security-email-login"),error=>error.code==="EMAIL_NOT_VERIFIED");
  } finally {
    if(previous===undefined)delete process.env.EMAIL_VERIFICATION_REQUIRED;else process.env.EMAIL_VERIFICATION_REQUIRED=previous;
  }
  assert.deepEqual(await verifyEmailToken(verification.token,"security-email-verify"),{verified:true});
  await assert.rejects(verifyEmailToken(verification.token,"security-email-replay"),error=>error.code==="EMAIL_VERIFICATION_INVALID");
  const login=await membership.login(email,"Security-email-password-12345","security-email-login-after-verify");
  assert.equal(typeof login.token,"string");
});

test("administrator recovery codes are single-use and create a restricted recovery session",async()=>{
  const email="security-admin-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-test-password-12345",firstName:"Security",lastName:"Admin"+suffix,phone:"09"+String(Date.now()).slice(-8)},"security-auth-test-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='system_admin' on conflict do nothing",[userId]);
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[userId]);
  const code="RECOVERY-"+suffix.toUpperCase();
  await db.query("insert into admin_passkey_recovery_code(user_id,code_hash) values($1,$2)",[userId,hashSecurityToken(code)]);
  const recovered=await recoverAdminPasskey(email,code,{ip:"198.51.100.24",userAgent:"security-test"},"security-auth-test-recovery");
  assert.equal(typeof recovered.token,"string");
  const session=(await db.query("select auth_method from auth_session where token_hash=(select token_hash from auth_session where user_id=$1 order by created_at desc limit 1)",[userId])).rows[0];
  assert.equal(session.auth_method,"recovery");
  await assert.rejects(recoverAdminPasskey(email,code,{ip:"198.51.100.24"},"security-auth-test-replay"),error=>error.code==="RECOVERY_INVALID");
});

test.after(async()=>{
  const db=getPool();
  for(const userId of createdUsers)await db.query("delete from app_user where id=$1",[userId]);
  await closePool();
});

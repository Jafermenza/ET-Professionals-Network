import assert from "node:assert/strict";

const base=process.env.CI_API_BASE_URL||"http://127.0.0.1:3000";
const email=process.env.BOOTSTRAP_ADMIN_EMAIL;
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!email||!password) throw new Error("CI smoke credentials are not configured.");

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(base+path,{
    method,
    headers:{
      ...(body?{"content-type":"application/json"}:{}),
      ...(token?{authorization:"Bearer "+token}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  return {status:response.status,payload};
}

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

const logout=await request("/api/v1/auth/logout",{method:"POST",token});
assert.equal(logout.status,200,"logout should revoke the current session");
const afterLogout=await request("/api/v1/me",{token});
assert.equal(afterLogout.status,401,"revoked session must not access authenticated profile data");

console.log("Authenticated API smoke passed: login, /me profile contract, logout, revoked-session denial.");

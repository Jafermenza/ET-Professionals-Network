import assert from "node:assert/strict";

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
\nconst publicMentors=await request("/api/v1/mentors");
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

const logout=await request("/api/v1/auth/logout",{method:"POST",token});
assert.equal(logout.status,200,"logout should revoke the current session");
const afterLogout=await request("/api/v1/me",{token});
assert.equal(afterLogout.status,401,"revoked session must not access authenticated profile data");

console.log("API smoke passed: public/member mentor discovery, private upload authorization/validation/confirmation/download, login, /me profile contract, logout, revoked-session denial.");

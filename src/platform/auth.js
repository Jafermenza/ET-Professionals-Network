import crypto from "node:crypto";
function timingSafeEqualText(a,b) { const aa=Buffer.from(a), bb=Buffer.from(b); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
function b64url(value) { return Buffer.from(value).toString("base64url"); }
export function signToken(payload, secret, now = Math.floor(Date.now()/1000)) {
  const header=b64url(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const body=b64url(JSON.stringify({...payload,iat:payload.iat ?? now}));
  const input=header+"."+body;
  return input+"."+crypto.createHmac("sha256",secret).update(input).digest("base64url");
}
export function verifyToken(token, secret, now = Math.floor(Date.now()/1000)) {
  if (!token || !secret) throw new Error("Authentication unavailable.");
  const parts=token.split("."); if(parts.length!==3) throw new Error("Invalid bearer token.");
  const expected=crypto.createHmac("sha256",secret).update(parts[0]+"."+parts[1]).digest("base64url");
  if(!timingSafeEqualText(parts[2],expected)) throw new Error("Invalid bearer token.");
  let payload; try { payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8")); } catch { throw new Error("Invalid bearer token."); }
  if(payload.exp !== undefined && Number(payload.exp) <= now) throw new Error("Bearer token expired.");
  if(!payload.sub) throw new Error("Bearer token subject missing.");
  return payload;
}
export function requireRole(identity, role) {
  const roles=Array.isArray(identity?.roles) ? identity.roles : [];
  if(!roles.includes(role)) { const e=new Error("Forbidden."); e.statusCode=403; throw e; }
  return identity;
}

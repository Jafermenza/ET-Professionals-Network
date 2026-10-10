import {getPool,withTransaction} from "./db.js";
import {hashPassword} from "../membership/identity.js";
function err(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e}
async function allowed(db,userId){const r=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);return r.rows.map(x=>x.role_code)}
function admin(roles){if(!roles.some(x=>["system_admin","admin"].includes(x)))throw err(403,"Administrator role required.","FORBIDDEN")}
export async function logout(userId,sessionId,requestId){
 return withTransaction(async tx=>{
  const result=await tx.query("update auth_session set revoked_at=now() where id=$1 and user_id=$2 and revoked_at is null returning id",[sessionId,userId]);
  if(result.rowCount){
   await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.logout','auth_session',$2,$3,'success',$4)",[userId,sessionId,requestId,JSON.stringify({})]);
  }
  return {loggedOut:true,sessionRevoked:result.rowCount===1};
 });
}

export async function listUsers(actor,input={}){
 const db=getPool(); admin(await allowed(db,actor)); const q=String(input.q||"").trim(); const status=input.status;
 const sql="select u.id,u.email,u.username,u.status,u.created_at,u.updated_at,coalesce(json_agg(distinct r.role_code) filter(where r.role_code is not null),'[]') roles from app_user u left join app_user_role ur on ur.user_id=u.id left join app_role r on r.id=ur.role_id where ($1='' or lower(u.email) like lower('%'||$1||'%') or lower(u.username) like lower('%'||$1||'%')) and ($2::text is null or u.status=$2) group by u.id order by u.created_at desc limit 200";
 return (await db.query(sql,[q,status||null])).rows;
}
export async function updateUser(actor,userId,input,requestId){
 const db=getPool(); const roles=await allowed(db,actor); admin(roles); const status=input.status; const roleCode=input.roleCode; const removeRoleCode=input.removeRoleCode;
 return withTransaction(async tx=>{
  const u=(await tx.query("select id,status from app_user where id=$1 for update",[userId])).rows[0]; if(!u)throw err(404,"User not found.","NOT_FOUND");
  if(status&& !["active","suspended","disabled"].includes(status))throw err(400,"Invalid user status.","VALIDATION_ERROR");
  if(status==="disabled"&&userId===actor)throw err(400,"You cannot disable your own account.","SELF_LOCKOUT");
  if(status)await tx.query("update app_user set status=$1,updated_at=now() where id=$2",[status,userId]);
  if(roleCode!==undefined){const rr=(await tx.query("select id from app_role where role_code=$1",[roleCode])).rows[0];if(!rr)throw err(400,"Unknown role.","INVALID_ROLE");await tx.query("insert into app_user_role(user_id,role_id,assigned_by) values($1,$2,$3) on conflict do nothing",[userId,rr.id,actor]);} if(removeRoleCode!==undefined){const rr=(await tx.query("select id from app_role where role_code=$1",[removeRoleCode])).rows[0];if(!rr)throw err(400,"Unknown role.","INVALID_ROLE");if(removeRoleCode==="system_admin"){const n=(await tx.query("select count(*)::int count from app_user_role ur join app_role r on r.id=ur.role_id where r.role_code=$1",["system_admin"])).rows[0].count;if(n<=1)throw err(400,"The last system administrator role cannot be removed.","LAST_ADMIN");if(userId===actor)throw err(400,"You cannot remove your own system administrator role.","SELF_LOCKOUT");}await tx.query("delete from app_user_role where user_id=$1 and role_id=$2",[userId,rr.id]);}
  // Role changes invalidate existing sessions as defense in depth; auth middleware also reloads current roles.
  if(roleCode!==undefined||removeRoleCode!==undefined||status==="suspended"||status==="disabled")
    await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.user.updated','app_user',$2,$3,'success',$4)",[actor,userId,requestId,JSON.stringify({status,roleCode,removeRoleCode})]); return {id:userId,status:status||u.status};
 });
}
export async function revokeSessions(actor,userId,requestId){const db=getPool();admin(await allowed(db,actor));const r=await db.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.sessions.revoked','app_user',$2,$3,'success',$4)",[actor,userId,requestId,JSON.stringify({count:r.rowCount})]);return {revoked:r.rowCount}}
export async function resetPassword(actor,userId,newPassword,requestId){const db=getPool();admin(await allowed(db,actor));if(String(newPassword||"").length<12)throw err(400,"Password must be at least 12 characters.","VALIDATION_ERROR");return withTransaction(async tx=>{await tx.query("update app_user set password_hash=$1,updated_at=now() where id=$2",[hashPassword(newPassword),userId]);await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.password.reset','app_user',$2,$3,'success','{}')",[actor,userId,requestId]);return {id:userId,sessionsRevoked:true}})}
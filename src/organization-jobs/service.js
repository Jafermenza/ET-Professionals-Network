import { getPool, withTransaction } from "../platform/db.js";

function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
const ORG_WRITE_ROLES=["owner","administrator","recruiter"];
const CANDIDATE_ROLES=["owner","administrator","recruiter"];

async function audit(db,actor,action,type,id,requestId,metadata={}){ await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]); }

async function orgRole(db,orgId,userId,roles=ORG_WRITE_ROLES){
 const r=(await db.query("select role_code from organization_membership where organization_id=$1 and user_id=$2 and status='active'",[orgId,userId])).rows[0];
 if(!r||!roles.includes(r.role_code)) throw error(403,"You do not have the required organization permission.","FORBIDDEN");
 return r.role_code;
}
async function verifiedOrg(db,orgId){
 const r=(await db.query("select * from organization where id=$1 and verification_status='verified'",[orgId])).rows[0];
 if(!r) throw error(409,"The organization must be verified before it can publish jobs.","ORGANIZATION_NOT_VERIFIED");
 return r;
}
async function validateReference(db,id,domain){
 if(!id) return null;
 const r=(await db.query("select ri.id from reference_item ri join reference_dataset_version rv on rv.id=ri.dataset_version_id join reference_dataset rd on rd.id=rv.dataset_id where ri.id=$1 and rd.domain=$2 and rv.status='published' and ri.active=true",[id,domain])).rows[0];
 if(!r) throw error(400,"Reference item is not valid for the selected published dataset.","INVALID_REFERENCE");
 return id;
}

export async function registerOrganization(userId,input,requestId){
 return withTransaction(async db=>{
  if(!input.legalName||!input.displayName) throw error(400,"legalName and displayName are required.","VALIDATION_ERROR");
  const existing=(await db.query("select id from organization where lower(legal_name)=lower($1)",[String(input.legalName).trim()])).rows[0];
  if(existing) throw error(409,"An organization with this legal name already exists.","DUPLICATE_ORGANIZATION");
  const geography=await validateReference(db,input.geographyReferenceItemId,"geography");
  const org=(await db.query("insert into organization(legal_name,display_name,organization_type,description,website,email,phone,geography_reference_item_id,address_text,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",[input.legalName,input.displayName,input.organizationType||null,input.description||null,input.website||null,input.email||null,input.phone||null,geography,input.addressText||null,userId])).rows[0];
  await db.query("insert into organization_membership(organization_id,user_id,role_code,status,joined_at) values($1,$2,'owner','active',now())",[org.id,userId]);
  await db.query("insert into organization_verification_case(organization_id,submitted_by) values($1,$2)",[org.id,userId]);
  await audit(db,userId,"organization.created","organization",org.id,requestId,{});
  return org;
 });
}

export async function getOrganization(orgId,viewerId=null){
 const db=getPool();
 const org=(await db.query("select o.*,ri.code geography_code,ri.label geography_label from organization o left join reference_item ri on ri.id=o.geography_reference_item_id where o.id=$1",[orgId])).rows[0];
 if(!org) throw error(404,"Organization not found.","NOT_FOUND");
 if(!org.public_visible && (!viewerId || !(await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active'",[orgId,viewerId])).rows[0])) throw error(404,"Organization not found.","NOT_FOUND");
 const users=(await db.query("select om.user_id,om.role_code,om.status from organization_membership om where om.organization_id=$1 and om.status='active'",[orgId])).rows;
 return {...org,users};
}

export async function listMyOrganizations(userId){
 return (await getPool().query("select o.*,om.role_code from organization o join organization_membership om on om.organization_id=o.id where om.user_id=$1 and om.status='active' order by o.created_at desc",[userId])).rows;
}

export async function addVerificationEvidence(orgId,userId,input,requestId){
 return withTransaction(async db=>{
  await orgRole(db,orgId,userId,["owner","administrator"]);
  const c=(await db.query("select id,status from organization_verification_case where organization_id=$1 for update",[orgId])).rows[0];
  if(!c) throw error(404,"Organization verification case not found.","NOT_FOUND");
  if(["verified","rejected"].includes(c.status)) throw error(409,"The organization verification case is closed.","INVALID_STATE");
  const e=(await db.query("insert into organization_verification_evidence(case_id,file_object_id,evidence_type,note,created_by) values($1,$2,$3,$4,$5) returning *",[c.id,input.fileObjectId,input.evidenceType||"supporting_document",input.note||null,userId])).rows[0];
  await audit(db,userId,"organization.verification_evidence_added","organization_verification_case",c.id,requestId,{evidenceType:e.evidence_type});
  return e;
 });
}

export async function submitOrganizationVerification(orgId,userId,requestId){
 return withTransaction(async db=>{
  await orgRole(db,orgId,userId,["owner","administrator"]);
  const c=(await db.query("select id,status from organization_verification_case where organization_id=$1 for update",[orgId])).rows[0];
  if(!c) throw error(404,"Organization verification case not found.","NOT_FOUND");
  if(!["submitted","correction_required"].includes(c.status)) throw error(409,"Organization verification is not in a submittable state.","INVALID_STATE");
  await db.query("update organization_verification_case set status='submitted',submitted_by=$1,submitted_at=now() where id=$2",[userId,c.id]);
  await db.query("update organization set verification_status='submitted',updated_at=now() where id=$1",[orgId]);
  await audit(db,userId,"organization.verification_submitted","organization",orgId,requestId,{});
  return {organizationId:orgId,status:"submitted"};
 });
}

export async function reviewOrganization(orgId,reviewerId,input,requestId){
 return withTransaction(async db=>{
  const allowed=(await db.query("select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code in ('reviewer','system_admin') limit 1",[reviewerId])).rows[0];
  if(!allowed) throw error(403,"Organization verification reviewer role required.","FORBIDDEN");
  if(!["verified","rejected","correction_required"].includes(input.decision)) throw error(400,"Invalid organization verification decision.","VALIDATION_ERROR");
  const c=(await db.query("select id,status from organization_verification_case where organization_id=$1 for update",[orgId])).rows[0];
  if(!c) throw error(404,"Organization verification case not found.","NOT_FOUND");
  if(c.status==="verified"&&input.decision!=="verified") throw error(409,"Verified organization requires a formal suspension workflow.","INVALID_STATE");
  const status=input.decision;
  await db.query("update organization_verification_case set status=$1,reviewed_by=$2,decision_reason=$3,reviewed_at=now() where id=$4",[status,reviewerId,input.reason||null,c.id]);
  await db.query("update organization set verification_status=$1,verified_at=case when $1='verified' then now() else verified_at end,verified_by=case when $1='verified' then $2 else verified_by end,public_visible=case when $1='verified' then true else false end,updated_at=now() where id=$3",[status,reviewerId,orgId]);
  await audit(db,reviewerId,"organization.verification_decided","organization",orgId,requestId,{decision:status});
  return {organizationId:orgId,status};
 });
}

export const ELIGIBILITY_RULES=[
 "membership_active","professional_verified","verified_claim","occupation","industry","education_level",
 "qualification_type","field_of_study","years_experience","availability","location_contains"
];

async function profileContext(db,userId){
 const r=(await db.query("select u.id user_id,pp.years_experience,pp.availability_status,pp.location_label,pp.id profile_id,m.status membership_status from app_user u join person p on p.user_id=u.id left join professional_profile pp on pp.person_id=p.id left join membership_record m on m.user_id=u.id and m.status='active' where u.id=$1",[userId])).rows[0];
 if(!r) throw error(404,"Applicant account not found.","NOT_FOUND");
 return r;
}

async function evaluateRule(db,userId,rule){
 const code=String(rule.rule_code).toLowerCase();
 const value=rule.value;
 if(!ELIGIBILITY_RULES.includes(code)) return {code,eligible:false,reason:"Unsupported eligibility rule."};
 const ctx=await profileContext(db,userId);
 if(code==="membership_active") return {code,eligible:ctx.membership_status==="active",reason:ctx.membership_status==="active"?"":"Active membership is required."};
 if(code==="professional_verified"){ const ok=(await db.query("select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability') limit 1",[userId])).rows[0]; return {code,eligible:Boolean(ok),reason:ok?"":"Professional verification is required."}; }
 if(code==="verified_claim"){
  const wanted=String(value?.code||value||"").toLowerCase();
  const ok=(await db.query("select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot)=$2 limit 1",[userId,wanted])).rows[0];
  return {code,eligible:Boolean(ok),reason:ok?"":"Required professional verification is not present."};
 }
 if(code==="years_experience"){
  const n=Number(value?.minimum??value); return {code,eligible:ctx.years_experience!==null&&Number(ctx.years_experience)>=n,reason:ctx.years_experience!==null&&Number(ctx.years_experience)>=n?"":"Required experience level is not met."};
 }
 if(code==="availability"){
  const wanted=Array.isArray(value)?value:[value]; return {code,eligible:wanted.map(String).includes(String(ctx.availability_status)),reason:wanted.map(String).includes(String(ctx.availability_status))?"":"Required availability is not met."};
 }
 if(code==="location_contains"){
  const wanted=Array.isArray(value)?value:[value]; const loc=String(ctx.location_label||"").toLowerCase(); const ok=wanted.some(v=>loc.includes(String(v).toLowerCase())); return {code,eligible:ok,reason:ok?"":"Required location is not matched."};
 }
 const relation=code;
 const wanted=Array.isArray(value)?value:[value];
 const rows=(await db.query("select ri.code,ri.id::text id from professional_profile_reference prf join reference_item ri on ri.id=prf.reference_item_id where prf.profile_id=$1 and prf.relation_type=$2",[ctx.profile_id,relation])).rows;
 const ok=rows.some(r=>wanted.includes(r.code)||wanted.includes(r.id));
 return {code,eligible:ok,reason:ok?"":"Required professional classification is not matched."};
}

export async function evaluateEligibility(jobId,userId){
 const db=getPool();
 const job=(await db.query("select id,visibility,status,organization_id from job where id=$1",[jobId])).rows[0];
 if(!job) throw error(404,"Job not found.","NOT_FOUND");
 if(job.status!=="published") return {eligible:false,results:[],summary:"Job is not currently accepting applications."};
 const rules=(await db.query("select * from job_eligibility_rule where job_id=$1 order by sort_order,id",[jobId])).rows;
 const results=[];
 if(job.visibility==="exclusive" && !rules.some(r=>r.rule_code==="membership_active")) rules.unshift({rule_code:"membership_active",value:true,required:true,reason_label:"Active MPA membership"});
 if(job.visibility==="exclusive" && !rules.some(r=>r.rule_code==="professional_verified")) rules.unshift({rule_code:"professional_verified",value:true,required:true,reason_label:"Verified professional status"});
 for(const rule of rules) results.push({...rule,...await evaluateRule(db,userId,rule)});
 const failed=results.filter(r=>r.required!==false&&!r.eligible);
 return {eligible:failed.length===0,results:results.map(r=>({code:r.rule_code,eligible:r.eligible,reason:r.reason_label||r.reason})),summary:failed.length?"Eligibility requirements are not met.":"Eligible to apply."};
}

async function safeProfileSnapshot(db,userId){
 const r=(await db.query("select p.display_name,p.phone,pp.professional_title,pp.headline,pp.bio,pp.years_experience,pp.availability_status,pp.location_label,pp.directory_summary from person p join professional_profile pp on pp.person_id=p.id where p.user_id=$1",[userId])).rows[0];
 return r||{};
}

export async function createJob(orgId,userId,input,requestId){
 return withTransaction(async db=>{
  await orgRole(db,orgId,userId);
  const industry=await validateReference(db,input.industryReferenceItemId,"industry");
  const occupation=await validateReference(db,input.occupationReferenceItemId,"occupation");
  if(!input.title||!input.description) throw error(400,"title and description are required.","VALIDATION_ERROR");
  const visibility=input.visibility==="exclusive"?"exclusive":"public";
  const job=(await db.query("insert into job(organization_id,title,description,employment_type,work_mode,location_label,industry_reference_item_id,occupation_reference_item_id,visibility,application_deadline,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *",[orgId,input.title,input.description,input.employmentType||null,input.workMode||null,input.locationLabel||null,industry,occupation,visibility,input.applicationDeadline||null,userId])).rows[0];
  if(Array.isArray(input.eligibilityRules)) await replaceRules(db,job.id,input.eligibilityRules);
  await audit(db,userId,"job.created","job",job.id,requestId,{visibility});
  return job;
 });
}
async function replaceRules(db,jobId,rules){
 await db.query("delete from job_eligibility_rule where job_id=$1",[jobId]);
 for(let i=0;i<rules.length;i++){
  const rule=rules[i]; if(!ELIGIBILITY_RULES.includes(String(rule.ruleCode).toLowerCase())) throw error(400,"Unsupported eligibility rule: "+rule.ruleCode,"INVALID_ELIGIBILITY_RULE");
  await db.query("insert into job_eligibility_rule(job_id,rule_code,operator,value,required,reason_label,sort_order) values($1,$2,$3,$4,$5,$6,$7)",[jobId,String(rule.ruleCode).toLowerCase(),rule.operator||"equals",rule.value,rule.required!==false,rule.reasonLabel||null,i]);
 }
}
export async function updateJob(jobId,userId,input,requestId){
 return withTransaction(async db=>{
  const j=(await db.query("select * from job where id=$1 for update",[jobId])).rows[0]; if(!j) throw error(404,"Job not found.","NOT_FOUND");
  await orgRole(db,j.organization_id,userId);
  if(["closed","archived"].includes(j.status)) throw error(409,"Closed or archived jobs cannot be edited.","INVALID_STATE");
  const industry=input.industryReferenceItemId===undefined?j.industry_reference_item_id:await validateReference(db,input.industryReferenceItemId,"industry");
  const occupation=input.occupationReferenceItemId===undefined?j.occupation_reference_item_id:await validateReference(db,input.occupationReferenceItemId,"occupation");
  const visibility=input.visibility===undefined?j.visibility:(input.visibility==="exclusive"?"exclusive":"public");
  const updated=(await db.query("update job set title=coalesce($1,title),description=coalesce($2,description),employment_type=coalesce($3,employment_type),work_mode=coalesce($4,work_mode),location_label=coalesce($5,location_label),industry_reference_item_id=$6,occupation_reference_item_id=$7,visibility=$8,application_deadline=coalesce($9,application_deadline),updated_by=$10,updated_at=now() where id=$11 returning *",[input.title||null,input.description||null,input.employmentType||null,input.workMode||null,input.locationLabel||null,industry,occupation,visibility,input.applicationDeadline||null,userId,jobId])).rows[0];
  if(Array.isArray(input.eligibilityRules)) await replaceRules(db,jobId,input.eligibilityRules);
  await audit(db,userId,"job.updated","job",jobId,requestId,{});
  return updated;
 });
}

export async function publishJob(jobId,userId,requestId){
 return withTransaction(async db=>{
  const j=(await db.query("select * from job where id=$1 for update",[jobId])).rows[0]; if(!j) throw error(404,"Job not found.","NOT_FOUND");
  await orgRole(db,j.organization_id,userId); await verifiedOrg(db,j.organization_id);
  if(!j.title||!j.description) throw error(400,"Job is incomplete.","VALIDATION_ERROR");
  if(j.visibility==="exclusive" && !(await db.query("select 1 from job_eligibility_rule where job_id=$1",[jobId])).rows[0]) throw error(400,"Exclusive jobs must define eligibility rules.","ELIGIBILITY_REQUIRED");
  await db.query("update job set status='published',published_at=coalesce(published_at,now()),updated_by=$1,updated_at=now() where id=$2",[userId,jobId]);
  await audit(db,userId,"job.published","job",jobId,requestId,{visibility:j.visibility});
  return (await db.query("select * from job where id=$1",[jobId])).rows[0];
 });
}

export async function changeJobStatus(jobId,userId,status,requestId){
 return withTransaction(async db=>{
  const j=(await db.query("select * from job where id=$1 for update",[jobId])).rows[0]; if(!j) throw error(404,"Job not found.","NOT_FOUND");
  await orgRole(db,j.organization_id,userId);
  if(!["draft","pending_review","published","paused","closed","archived"].includes(status)) throw error(400,"Invalid job status.","VALIDATION_ERROR");
  if(status==="published") await verifiedOrg(db,j.organization_id);
  await db.query("update job set status=$1,closed_at=case when $1='closed' then now() else closed_at end,updated_by=$2,updated_at=now() where id=$3",[status,userId,jobId]);
  await audit(db,userId,"job.status_changed","job",jobId,requestId,{status});
  return (await db.query("select * from job where id=$1",[jobId])).rows[0];
 });
}

export async function listJobs(filters={},viewerId=null){
 const db=getPool(); const args=[]; const where=["j.status='published'","(j.application_deadline is null or j.application_deadline>now())","o.verification_status='verified'","o.public_visible=true"];
 if(filters.visibility){args.push(filters.visibility);where.push("j.visibility=$"+args.length);}
 if(filters.q){args.push("%"+String(filters.q).trim()+"%");where.push("(j.title ilike $"+args.length+" or j.description ilike $"+args.length+")");}
 const rows=(await db.query("select j.id,j.title,j.description,j.employment_type,j.work_mode,j.location_label,j.visibility,j.application_deadline,j.published_at,o.id organization_id,o.display_name organization_name from job j join organization o on o.id=j.organization_id where "+where.join(" and ")+" order by j.published_at desc",[...args])).rows;
 return {items:rows};
}

export async function getJob(jobId,viewerId=null){
 const db=getPool();
 const j=(await db.query("select j.*,o.display_name organization_name,o.description organization_description from job j join organization o on o.id=j.organization_id where j.id=$1 and j.status='published' and o.verification_status='verified' and o.public_visible=true",[jobId])).rows[0];
 if(!j) throw error(404,"Job not found.","NOT_FOUND");
 const rules=(await db.query("select rule_code,operator,value,required,reason_label,sort_order from job_eligibility_rule where job_id=$1 order by sort_order",[jobId])).rows;
 return {...j,eligibility:rules.map(r=>({code:r.rule_code,required:r.required,reasonLabel:r.reason_label}))};
}

export async function listOrganizationJobs(orgId,userId){
 const db=getPool(); await orgRole(db,orgId,userId,["owner","administrator","recruiter","read_only"]);
 return (await db.query("select * from job where organization_id=$1 order by created_at desc",[orgId])).rows;
}

export async function applyToJob(jobId,userId,input,requestId){
 return withTransaction(async db=>{
  const j=(await db.query("select * from job where id=$1 for update",[jobId])).rows[0]; if(!j) throw error(404,"Job not found.","NOT_FOUND");
  if(j.status!=="published" || (j.application_deadline&&new Date(j.application_deadline)<=new Date())) throw error(409,"This job is not accepting applications.","JOB_NOT_OPEN");
  const eligibility=await evaluateEligibility(jobId,userId);
  if(!eligibility.eligible) throw error(403,"You are not eligible to apply to this job.","NOT_ELIGIBLE");
  const snapshot=await safeProfileSnapshot(db,userId);
  const app=(await db.query("insert into job_application(job_id,applicant_user_id,status,cover_letter,profile_snapshot,eligibility_snapshot,submitted_at) values($1,$2,'submitted',$3,$4,$5,now()) on conflict(job_id,applicant_user_id) do update set cover_letter=excluded.cover_letter,status='submitted',profile_snapshot=excluded.profile_snapshot,eligibility_snapshot=excluded.eligibility_snapshot,submitted_at=now(),updated_at=now() returning *",[jobId,userId,input.coverLetter||null,snapshot,eligibility])).rows[0];
  await db.query("insert into job_application_event(application_id,actor_user_id,from_status,to_status,note) values($1,$2,null,'submitted',$3)",[app.id,userId,input.note||null]);
  await audit(db,userId,"job.application_submitted","job_application",app.id,requestId,{jobId});
  return app;
 });
}

export async function listMyApplications(userId){
 return (await getPool().query("select a.*,j.title,j.visibility,o.display_name organization_name from job_application a join job j on j.id=a.job_id join organization o on o.id=j.organization_id where a.applicant_user_id=$1 order by a.created_at desc",[userId])).rows;
}

export async function listCandidates(jobId,userId){
 const db=getPool(); const j=(await db.query("select organization_id from job where id=$1",[jobId])).rows[0]; if(!j) throw error(404,"Job not found.","NOT_FOUND");
 await orgRole(db,j.organization_id,userId,CANDIDATE_ROLES);
 return (await db.query("select a.id,a.status,a.cover_letter,a.profile_snapshot,a.eligibility_snapshot,a.submitted_at,a.updated_at from job_application a where a.job_id=$1 order by a.created_at desc",[jobId])).rows;
}

const APPLICATION_TRANSITIONS={
 submitted:["screening","rejected","withdrawn"],
 screening:["shortlisted","rejected","withdrawn"],
 shortlisted:["interview","rejected","withdrawn"],
 interview:["offer","rejected","withdrawn"],
 offer:["accepted","rejected","withdrawn"],
 accepted:["hired","withdrawn"],
 hired:[],
 rejected:[],
 withdrawn:[]
};
export function allowedApplicationTransition(from,to){ return (APPLICATION_TRANSITIONS[from]||[]).includes(to); }

export async function updateCandidate(jobId,applicationId,userId,input,requestId){
 return withTransaction(async db=>{
  const j=(await db.query("select organization_id from job where id=$1",[jobId])).rows[0]; if(!j) throw error(404,"Job not found.","NOT_FOUND");
  await orgRole(db,j.organization_id,userId,CANDIDATE_ROLES);
  const a=(await db.query("select * from job_application where id=$1 and job_id=$2 for update",[applicationId,jobId])).rows[0]; if(!a) throw error(404,"Application not found.","NOT_FOUND");
  if(!allowedApplicationTransition(a.status,input.status)) throw error(409,"Invalid candidate status transition.","INVALID_STATE");
  await db.query("update job_application set status=$1,decided_at=case when $1 in ('accepted','rejected','hired') then now() else decided_at end,updated_at=now() where id=$2",[input.status,applicationId]);
  await db.query("insert into job_application_event(application_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[applicationId,userId,a.status,input.status,input.note||null]);
  await audit(db,userId,"job.candidate_status_changed","job_application",applicationId,requestId,{from:a.status,to:input.status});
  return (await db.query("select * from job_application where id=$1",[applicationId])).rows[0];
 });
}

export async function addApplicationAttachment(applicationId,userId,input,requestId){
 return withTransaction(async db=>{
  const a=(await db.query("select id,applicant_user_id from job_application where id=$1",[applicationId])).rows[0]; if(!a) throw error(404,"Application not found.","NOT_FOUND");
  if(a.applicant_user_id!==userId) throw error(403,"Only the applicant can add application documents.","FORBIDDEN");
  const r=(await db.query("insert into job_application_attachment(application_id,file_object_id,attachment_type) values($1,$2,$3) returning *",[applicationId,input.fileObjectId,input.attachmentType||"application_document"])).rows[0];
  await audit(db,userId,"job.application_attachment_added","job_application",applicationId,requestId,{});
  return r;
 });
}

export async function addOrganizationUser(orgId,actorUserId,input,requestId){
 return withTransaction(async db=>{
  await orgRole(db,orgId,actorUserId,["owner","administrator"]);
  if(!["owner","administrator","recruiter","project_manager","event_manager","finance","read_only"].includes(input.roleCode)) throw error(400,"Invalid organization role.","VALIDATION_ERROR");
  const target=(await db.query("select id from app_user where id=$1",[input.userId])).rows[0]; if(!target) throw error(404,"User account not found.","NOT_FOUND");
  const row=(await db.query("insert into organization_membership(organization_id,user_id,role_code,status,invited_by,joined_at) values($1,$2,$3,'active',$4,now()) on conflict(organization_id,user_id) do update set role_code=excluded.role_code,status='active',updated_at=now() returning *",[orgId,input.userId,input.roleCode,actorUserId])).rows[0];
  await audit(db,actorUserId,"organization.user_added","organization_membership",row.id,requestId,{roleCode:input.roleCode});
  return row;
 });
}
export async function updateOrganizationUser(orgId,actorUserId,userId,input,requestId){
 return withTransaction(async db=>{
  await orgRole(db,orgId,actorUserId,["owner","administrator"]);
  const row=(await db.query("select * from organization_membership where organization_id=$1 and user_id=$2 for update",[orgId,userId])).rows[0]; if(!row) throw error(404,"Organization user not found.","NOT_FOUND");
  if(row.role_code==="owner"&&actorUserId!==userId) throw error(403,"The owner role requires a dedicated ownership transfer workflow.","FORBIDDEN");
  const role=input.roleCode||row.role_code; if(!["owner","administrator","recruiter","project_manager","event_manager","finance","read_only"].includes(role)) throw error(400,"Invalid organization role.","VALIDATION_ERROR");
  const status=input.status||row.status; if(!["active","suspended","removed"].includes(status)) throw error(400,"Invalid organization user status.","VALIDATION_ERROR");
  const updated=(await db.query("update organization_membership set role_code=$1,status=$2,updated_at=now() where id=$3 returning *",[role,status,row.id])).rows[0];
  await audit(db,actorUserId,"organization.user_updated","organization_membership",row.id,requestId,{roleCode:role,status});
  return updated;
 });
}
export async function listOrganizationUsers(orgId,actorUserId){
 const db=getPool(); await orgRole(db,orgId,actorUserId,["owner","administrator","recruiter","read_only"]);
 return (await db.query("select om.user_id,om.role_code,om.status,om.joined_at,p.display_name,u.email from organization_membership om join app_user u on u.id=om.user_id left join person p on p.user_id=u.id where om.organization_id=$1 order by om.created_at",[orgId])).rows;
}

import { getPool, withTransaction } from "../platform/db.js";

function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
function limitValue(v){ return Math.min(Math.max(Number(v)||25,1),100); }

async function audit(db,actor,action,type,id,requestId,metadata={}){ await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]); }

export async function updateVisibility(userId,input,requestId){
 return withTransaction(async db=>{
  const row=(await db.query("insert into verification_visibility(user_id) values($1) on conflict(user_id) do update set directory_visible=coalesce($2,verification_visibility.directory_visible),show_identity_badge=coalesce($3,verification_visibility.show_identity_badge),show_professional_badge=coalesce($4,verification_visibility.show_professional_badge),show_experience_badge=coalesce($5,verification_visibility.show_experience_badge),show_location=coalesce($6,verification_visibility.show_location),show_experience=coalesce($7,verification_visibility.show_experience),show_contact=coalesce($8,verification_visibility.show_contact),updated_at=now() returning *",[userId,input.directoryVisible,input.showIdentityBadge,input.showProfessionalBadge,input.showExperienceBadge,input.showLocation,input.showExperience,input.showContact])).rows[0];
  await audit(db,userId,"talent.visibility_updated","verification_visibility",row.id,requestId,{directoryVisible:row.directory_visible});
  return row;
 });
}

export async function getVisibility(userId){ const db=getPool(); const r=await db.query("select * from verification_visibility where user_id=$1",[userId]); return r.rows[0]||{user_id:userId,directory_visible:false}; }

function viewerVisibilityClause(viewerIsMember){ return viewerIsMember ? "(pp.visibility in ('members','public'))" : "pp.visibility='public'"; }

export async function searchTalent(viewerId,filters={}){
 const db=getPool(); const args=[viewerId]; const where=["m.status='active'", "vv.directory_visible=true", viewerVisibilityClause(Boolean(viewerId))];
 if(filters.q){ args.push("%"+String(filters.q).trim()+"%"); where.push("(pp.professional_title ilike $"+args.length+" or pp.headline ilike $"+args.length+" or pp.directory_summary ilike $"+args.length+" or p.display_name ilike $"+args.length+")"); }
 const refFilter=(param,relation)=>{ if(filters[param]){ args.push(String(filters[param])); where.push("exists (select 1 from professional_profile_reference prf join reference_item ri on ri.id=prf.reference_item_id where prf.profile_id=pp.id and prf.relation_type='"+relation+"' and (ri.code=$"+args.length+" or ri.id::text=$"+args.length+"))"); } };
 refFilter("occupation","occupation"); refFilter("industry","industry"); refFilter("educationLevel","education_level"); refFilter("qualificationType","qualification_type"); refFilter("fieldOfStudy","field_of_study");
 if(filters.availability){ args.push(String(filters.availability)); where.push("pp.availability_status=$"+args.length); }
 if(filters.location){ args.push("%"+String(filters.location).trim()+"%"); where.push("pp.location_label ilike $"+args.length); }
 if(filters.verifiedClaim){ args.push(String(filters.verifiedClaim).toUpperCase()); where.push("exists (select 1 from verification_claim vc join verification_case vcase on vcase.id=vc.case_id join verification_program vp on vp.id=vcase.program_id where vcase.subject_user_id=u.id and vc.status='verified' and vc.claim_code_snapshot=$"+args.length+")"); }
 const limit=limitValue(filters.limit),offset=Math.max(Number(filters.offset)||0,0);
 const sql="select distinct u.id user_id,p.display_name,pp.id profile_id,pp.professional_title,pp.headline,pp.directory_summary,pp.years_experience,pp.availability_status,"+
 "(case when vv.show_location then pp.location_label else null end) location_label,"+
 "vv.show_identity_badge,vv.show_professional_badge,vv.show_experience_badge,vv.show_experience,"+
 "(select count(*)::int from verification_claim vc join verification_case vcase on vcase.id=vc.case_id where vcase.subject_user_id=u.id and vc.status='verified') verified_claim_count "+
 "from app_user u join person p on p.user_id=u.id join professional_profile pp on pp.person_id=p.id join membership_record m on m.user_id=u.id and m.status='active' join verification_visibility vv on vv.user_id=u.id "+
 "where "+where.join(" and ")+" order by pp.professional_title nulls last,p.display_name limit "+limit+" offset "+offset;
 const rows=(await db.query(sql,args)).rows;
 return {items:rows,limit,offset};
}

export async function getTalent(userId,viewerId){
 const db=getPool();
 const viewerMember=Boolean(viewerId);
 const where=viewerMember?"pp.visibility in ('members','public')":"pp.visibility='public'";
 const row=(await db.query("select u.id user_id,p.display_name,pp.id profile_id,pp.professional_title,pp.headline,pp.bio,pp.directory_summary,pp.years_experience,pp.availability_status,case when vv.show_location then pp.location_label else null end location_label,case when vv.show_contact and u.id=$2 then p.phone else null end phone,vv.show_identity_badge,vv.show_professional_badge,vv.show_experience_badge,vv.show_experience from app_user u join person p on p.user_id=u.id join professional_profile pp on pp.person_id=p.id join membership_record m on m.user_id=u.id and m.status='active' join verification_visibility vv on vv.user_id=u.id where u.id=$1 and vv.directory_visible=true and "+where,[userId,viewerId||null])).rows[0];
 if(!row) throw error(404,"Professional not found or not visible.","NOT_FOUND");
 const refs=(await db.query("select prf.relation_type,ri.code,ri.label,ri.dataset_version_id from professional_profile_reference prf join reference_item ri on ri.id=prf.reference_item_id where prf.profile_id=$1 order by prf.relation_type,prf.is_primary desc,ri.label",[row.profile_id])).rows;
 const claims=(await db.query("select distinct vc.claim_code_snapshot claim_code from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified'",[userId])).rows;
 const experience=row.show_experience?(await db.query("select id,employer_name,role_title,start_date,end_date,current_role,description from professional_experience where profile_id=$1 and visibility in ('members','public') order by start_date desc nulls last",[row.profile_id])).rows:[];
 return {...row,references:refs,verifiedClaims:claims,experience};
}

export async function saveSearch(userId,input,requestId){
 return withTransaction(async db=>{ const row=(await db.query("insert into talent_saved_search(user_id,name,criteria) values($1,$2,$3) returning *",[userId,input.name,input.criteria||{}])).rows[0]; await audit(db,userId,"talent.saved_search_created","talent_saved_search",row.id,requestId); return row; });
}
export async function listSavedSearches(userId){ return (await getPool().query("select * from talent_saved_search where user_id=$1 and active=true order by created_at desc",[userId])).rows; }

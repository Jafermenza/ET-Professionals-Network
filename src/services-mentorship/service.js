import { getPool, withTransaction } from "../platform/db.js";

function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
const ACTIVE_MEMBER_SQL="exists (select 1 from membership_record m where m.user_id=$1 and m.status='active')";
const PROFESSIONAL_CLAIMS=["professional_certification","education","employment","experience","service_capability"];

async function audit(db,actor,action,type,id,requestId,metadata={}) {
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);
}
async function activeMember(db,userId){
  return (await db.query("select 1 where "+ACTIVE_MEMBER_SQL,[userId])).rowCount>0;
}
async function professionalVerified(db,userId){
  return (await db.query("select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot)=any($2::text[]) limit 1",[userId,PROFESSIONAL_CLAIMS])).rowCount>0;
}
function normalizeArray(v){ return Array.isArray(v)?v.map(x=>String(x).trim().toLowerCase()).filter(Boolean):[]; }
function overlap(a,b){ const set=new Set(normalizeArray(a)); return normalizeArray(b).filter(x=>set.has(x)).length; }

const SERVICE_TRANSITIONS={
 requested:["accepted","declined","cancelled"],
 accepted:["in_progress","cancelled"],
 in_progress:["completed","disputed","cancelled"],
 disputed:["in_progress","completed","cancelled"],
 completed:[],
 declined:[],
 cancelled:[]
};
export function allowedServiceRequestTransition(from,to){ return (SERVICE_TRANSITIONS[from]||[]).includes(to); }

const MENTORSHIP_TRANSITIONS={
 active:["paused","completed","cancelled"],
 paused:["active","completed","cancelled"],
 completed:[],
 cancelled:[]
};
export function allowedMentorshipTransition(from,to){ return (MENTORSHIP_TRANSITIONS[from]||[]).includes(to); }

const MATCH_TRANSITIONS={proposed:["accepted","declined","expired","cancelled"],accepted:[],declined:[],expired:[],cancelled:[]};
export function allowedMatchTransition(from,to){ return (MATCH_TRANSITIONS[from]||[]).includes(to); }

const SESSION_TRANSITIONS={scheduled:["completed","cancelled","no_show"],completed:[],cancelled:[],no_show:[]};
export function allowedSessionTransition(from,to){ return (SESSION_TRANSITIONS[from]||[]).includes(to); }

export async function createServiceListing(userId,input,requestId){
  return withTransaction(async db=>{
    if(!(await activeMember(db,userId))) throw error(403,"An active membership is required to offer a service.","MEMBERSHIP_REQUIRED");
    if(!input.title||!input.description||!input.serviceCategory) throw error(400,"title, description and serviceCategory are required.","VALIDATION_ERROR");
    const pricing=input.pricingModel||"quote";
    if(!["free","fixed","hourly","quote"].includes(pricing)) throw error(400,"Unsupported pricing model.","VALIDATION_ERROR");
    const row=(await db.query("insert into service_listing(provider_user_id,title,description,service_category,delivery_mode,location_label,pricing_model,price_amount,currency,visibility,max_active_requests) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *",[userId,input.title,input.description,input.serviceCategory,input.deliveryMode||"remote",input.locationLabel||null,pricing,input.priceAmount??null,input.currency||null,input.visibility||"members",input.maxActiveRequests??null])).rows[0];
    await audit(db,userId,"service.listing_created","service_listing",row.id,requestId);
    return row;
  });
}

export async function updateServiceListing(listingId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row) throw error(404,"Service listing not found.","NOT_FOUND");
    if(row.provider_user_id!==userId) throw error(403,"Only the service provider can edit this listing.","FORBIDDEN");
    if(row.status==="closed") throw error(409,"Closed service listings cannot be edited.","INVALID_STATE");
    const updated=(await db.query("update service_listing set title=coalesce($1,title),description=coalesce($2,description),service_category=coalesce($3,service_category),delivery_mode=coalesce($4,delivery_mode),location_label=coalesce($5,location_label),pricing_model=coalesce($6,pricing_model),price_amount=coalesce($7,price_amount),currency=coalesce($8,currency),visibility=coalesce($9,visibility),max_active_requests=coalesce($10,max_active_requests),updated_at=now() where id=$11 returning *",[input.title||null,input.description||null,input.serviceCategory||null,input.deliveryMode||null,input.locationLabel||null,input.pricingModel||null,input.priceAmount??null,input.currency||null,input.visibility||null,input.maxActiveRequests??null,listingId])).rows[0];
    await audit(db,userId,"service.listing_updated","service_listing",listingId,requestId);
    return updated;
  });
}

export async function changeServiceListingStatus(listingId,userId,status,requestId){
  if(!["draft","published","paused","closed"].includes(status)) throw error(400,"Unsupported service listing status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!row) throw error(404,"Service listing not found.","NOT_FOUND");
    if(row.provider_user_id!==userId) throw error(403,"Only the service provider can manage this listing.","FORBIDDEN");
    if(status==="published" && !(await activeMember(db,userId))) throw error(403,"An active membership is required to publish a service.","MEMBERSHIP_REQUIRED");
    if(row.status==="closed" && status!=="closed") throw error(409,"Closed service listings cannot be reopened.","INVALID_STATE");
    const updated=(await db.query("update service_listing set status=$1,updated_at=now() where id=$2 returning *",[status,listingId])).rows[0];
    await audit(db,userId,"service.listing_status_changed","service_listing",listingId,requestId,{from:row.status,to:status});
    return updated;
  });
}

export async function listServices(viewerId=null,filters={}){
  const db=getPool(); const args=[]; const where=["s.status='published'"];
  if(viewerId){ where.push("(s.visibility='public' or s.visibility='members')"); }
  else where.push("s.visibility='public'");
  if(filters.category){ args.push(String(filters.category)); where.push("s.service_category=$"+args.length); }
  if(filters.q){ args.push("%"+String(filters.q).trim()+"%"); where.push("(s.title ilike $"+args.length+" or s.description ilike $"+args.length+" or s.service_category ilike $"+args.length+")"); }
  const limit=Math.min(Math.max(Number(filters.limit)||25,1),100),offset=Math.max(Number(filters.offset)||0,0);
  const rows=(await db.query("select s.id,s.provider_user_id,s.title,s.description,s.service_category,s.delivery_mode,s.location_label,s.pricing_model,s.price_amount,s.currency,s.visibility,s.created_at,p.display_name from service_listing s join person p on p.user_id=s.provider_user_id where "+where.join(" and ")+" order by s.created_at desc limit "+limit+" offset "+offset,args)).rows;
  return {items:rows,limit,offset};
}

export async function getServiceListing(listingId,viewerId=null){
  const db=getPool();
  const row=(await db.query("select s.*,p.display_name provider_name from service_listing s join person p on p.user_id=s.provider_user_id where s.id=$1 and s.status='published' and (s.visibility='public' or ($2::uuid is not null and s.visibility='members'))",[listingId,viewerId||null])).rows[0];
  if(!row) throw error(404,"Service listing not found or not visible.","NOT_FOUND");
  return row;
}

export async function requestService(listingId,requesterId,input,requestId){
  return withTransaction(async db=>{
    if(!(await activeMember(db,requesterId))) throw error(403,"An active membership is required to request a service.","MEMBERSHIP_REQUIRED");
    const listing=(await db.query("select * from service_listing where id=$1 for update",[listingId])).rows[0];
    if(!listing||listing.status!=="published") throw error(404,"Service listing is not available.","NOT_FOUND");
    if(listing.provider_user_id===requesterId) throw error(409,"You cannot request your own service.","SELF_REQUEST");
    if(listing.max_active_requests){
      const count=(await db.query("select count(*)::int count from service_request where service_listing_id=$1 and status in ('requested','accepted','in_progress')",[listingId])).rows[0].count;
      if(count>=listing.max_active_requests) throw error(409,"This service has reached its active request limit.","CAPACITY_REACHED");
    }
    const duplicate=(await db.query("select id from service_request where service_listing_id=$1 and requester_user_id=$2 and status in ('requested','accepted','in_progress')",[listingId,requesterId])).rows[0];
    if(duplicate) throw error(409,"You already have an active request for this service.","DUPLICATE_REQUEST");
    const row=(await db.query("insert into service_request(service_listing_id,requester_user_id,provider_user_id,status,message,requested_start_at,requested_end_at) values($1,$2,$3,'requested',$4,$5,$6) returning *",[listingId,requesterId,listing.provider_user_id,input.message||null,input.requestedStartAt||null,input.requestedEndAt||null])).rows[0];
    await db.query("insert into service_request_event(request_id,actor_user_id,to_status,note) values($1,$2,'requested',$3)",[row.id,requesterId,input.message||null]);
    await audit(db,requesterId,"service.request_created","service_request",row.id,requestId,{listingId});
    return row;
  });
}

export async function listMyServiceRequests(userId){
  const db=getPool();
  return (await db.query("select r.*,s.title service_title,s.service_category,p.display_name requester_name from service_request r join service_listing s on s.id=r.service_listing_id join person p on p.user_id=r.requester_user_id where r.provider_user_id=$1 or r.requester_user_id=$1 order by r.created_at desc",[userId])).rows;
}

export async function changeServiceRequestStatus(requestId,userId,status,note,requestIdHeader){
  if(!allowedServiceRequestTransition("x",status) && !["requested"].includes(status)){}
  return withTransaction(async db=>{
    const r=(await db.query("select * from service_request where id=$1 for update",[requestId])).rows[0];
    if(!r) throw error(404,"Service request not found.","NOT_FOUND");
    if(r.provider_user_id!==userId && r.requester_user_id!==userId) throw error(403,"You are not a participant in this service request.","FORBIDDEN");
    if(r.status==="requested" && r.requester_user_id!==userId && !["accepted","declined"].includes(status)) throw error(409,"The provider may accept or decline a new request.","INVALID_STATE");
    if(r.status==="accepted" && r.requester_user_id!==userId && status==="cancelled") throw error(409,"Only the requester may cancel after acceptance.","INVALID_STATE");
    if(!allowedServiceRequestTransition(r.status,status)) throw error(409,"Invalid service request transition.","INVALID_STATE");
    const updated=(await db.query("update service_request set status=$1,provider_note=case when $2::uuid=provider_user_id then $3 else provider_note end,requester_note=case when $2::uuid=requester_user_id then $3 else requester_note end,completed_at=case when $1='completed' then now() else completed_at end,cancelled_at=case when $1='cancelled' then now() else cancelled_at end,updated_at=now() where id=$4 returning *",[status,userId,note||null,requestId])).rows[0];
    await db.query("insert into service_request_event(request_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[requestId,userId,r.status,status,note||null]);
    await audit(db,userId,"service.request_status_changed","service_request",requestId,requestIdHeader,{from:r.status,to:status});
    return updated;
  });
}

export async function createMentorProfile(userId,input,requestId){
  return withTransaction(async db=>{
    if(!(await activeMember(db,userId))) throw error(403,"An active membership is required to mentor.","MEMBERSHIP_REQUIRED");
    if(!(await professionalVerified(db,userId))) throw error(403,"A verified professional claim is required to become a mentor.","PROFESSIONAL_VERIFICATION_REQUIRED");
    if(!input.headline) throw error(400,"headline is required.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentor_profile(user_id,headline,bio,expertise,languages,mentoring_modes,max_active_mentees,visibility) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(user_id) do update set headline=excluded.headline,bio=excluded.bio,expertise=excluded.expertise,languages=excluded.languages,mentoring_modes=excluded.mentoring_modes,max_active_mentees=excluded.max_active_mentees,visibility=excluded.visibility,status='active',updated_at=now() returning *",[userId,input.headline,input.bio||null,JSON.stringify(normalizeArray(input.expertise)),JSON.stringify(normalizeArray(input.languages)),JSON.stringify(normalizeArray(input.mentoringModes||["remote"])),input.maxActiveMentees||3,input.visibility||"members"])).rows[0];
    await audit(db,userId,"mentorship.profile_updated","mentor_profile",row.id,requestId);
    return row;
  });
}

export async function updateMentorProfile(profileId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from mentor_profile where id=$1 for update",[profileId])).rows[0];
    if(!row) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(row.user_id!==userId) throw error(403,"Only the mentor can edit this profile.","FORBIDDEN");
    const updated=(await db.query("update mentor_profile set headline=coalesce($1,headline),bio=coalesce($2,bio),expertise=coalesce($3,expertise),languages=coalesce($4,languages),mentoring_modes=coalesce($5,mentoring_modes),max_active_mentees=coalesce($6,max_active_mentees),visibility=coalesce($7,visibility),updated_at=now() where id=$8 returning *",[input.headline||null,input.bio||null,input.expertise?JSON.stringify(normalizeArray(input.expertise)):null,input.languages?JSON.stringify(normalizeArray(input.languages)):null,input.mentoringModes?JSON.stringify(normalizeArray(input.mentoringModes)):null,input.maxActiveMentees||null,input.visibility||null,profileId])).rows[0];
    await audit(db,userId,"mentorship.profile_updated","mentor_profile",profileId,requestId);
    return updated;
  });
}

export async function changeMentorStatus(profileId,userId,status,requestId){
  if(!["draft","active","paused","closed"].includes(status)) throw error(400,"Unsupported mentor status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const p=(await db.query("select * from mentor_profile where id=$1 for update",[profileId])).rows[0];
    if(!p) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(p.user_id!==userId) throw error(403,"Only the mentor can manage this profile.","FORBIDDEN");
    if(status==="active" && !(await professionalVerified(db,userId))) throw error(403,"A verified professional claim is required to activate a mentor profile.","PROFESSIONAL_VERIFICATION_REQUIRED");
    if(p.status==="closed"&&status!=="closed") throw error(409,"Closed mentor profiles cannot be reopened.","INVALID_STATE");
    const row=(await db.query("update mentor_profile set status=$1,updated_at=now() where id=$2 returning *",[status,profileId])).rows[0];
    await audit(db,userId,"mentorship.profile_status_changed","mentor_profile",profileId,requestId,{from:p.status,to:status});
    return row;
  });
}

export async function setMentorAvailability(profileId,userId,input,requestId){
  return withTransaction(async db=>{
    const p=(await db.query("select user_id from mentor_profile where id=$1",[profileId])).rows[0];
    if(!p) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(p.user_id!==userId) throw error(403,"Only the mentor can manage availability.","FORBIDDEN");
    if(!Array.isArray(input.slots)) throw error(400,"slots must be an array.","VALIDATION_ERROR");
    await db.query("delete from mentor_availability where mentor_profile_id=$1",[profileId]);
    for(const s of input.slots){
      if(!Number.isInteger(Number(s.dayOfWeek))||Number(s.dayOfWeek)<0||Number(s.dayOfWeek)>6) throw error(400,"dayOfWeek must be 0-6.","VALIDATION_ERROR");
      await db.query("insert into mentor_availability(mentor_profile_id,day_of_week,start_time,end_time,timezone) values($1,$2,$3,$4,$5)",[profileId,Number(s.dayOfWeek),s.startTime,s.endTime,s.timezone||"Africa/Addis_Ababa"]);
    }
    await audit(db,userId,"mentorship.availability_updated","mentor_profile",profileId,requestId,{slotCount:input.slots.length});
    return (await db.query("select * from mentor_availability where mentor_profile_id=$1 order by day_of_week,start_time",[profileId])).rows;
  });
}

export async function addMentorTimeOff(profileId,userId,input,requestId){
  return withTransaction(async db=>{
    const p=(await db.query("select user_id from mentor_profile where id=$1",[profileId])).rows[0];
    if(!p) throw error(404,"Mentor profile not found.","NOT_FOUND");
    if(p.user_id!==userId) throw error(403,"Only the mentor can manage availability.","FORBIDDEN");
    if(!input.startsAt||!input.endsAt) throw error(400,"startsAt and endsAt are required.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentor_time_off(mentor_profile_id,starts_at,ends_at,reason) values($1,$2,$3,$4) returning *",[profileId,input.startsAt,input.endsAt,input.reason||null])).rows[0];
    await audit(db,userId,"mentorship.time_off_added","mentor_profile",profileId,requestId,{timeOffId:row.id});
    return row;
  });
}

export async function listMentors(viewerId,filters={}){
  const db=getPool(); const args=[viewerId]; const where=["mp.status='active'","m.status='active'","mp.visibility in ('members','public')"];
  if(filters.q){ args.push("%"+String(filters.q).trim()+"%"); where.push("(mp.headline ilike $"+args.length+" or mp.bio ilike $"+args.length+")"); }
  if(filters.topic){ args.push("%"+String(filters.topic).trim().toLowerCase()+"%"); where.push("mp.expertise::text ilike $"+args.length); }
  const rows=(await db.query("select mp.id,mp.user_id,p.display_name,mp.headline,mp.bio,mp.expertise,mp.languages,mp.mentoring_modes,mp.max_active_mentees from mentor_profile mp join app_user u on u.id=mp.user_id join person p on p.user_id=u.id join membership_record m on m.user_id=u.id where "+where.join(" and ")+" order by p.display_name",args)).rows;
  return rows;
}

export async function createMentorshipRequest(menteeId,input,requestId){
  return withTransaction(async db=>{
    if(!(await activeMember(db,menteeId))) throw error(403,"An active membership is required for mentorship.","MEMBERSHIP_REQUIRED");
    if(!input.goals) throw error(400,"goals are required.","VALIDATION_ERROR");
    if(input.preferredMentorUserId===menteeId) throw error(400,"You cannot mentor yourself.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentorship_request(mentee_user_id,preferred_mentor_user_id,goals,topics,preferred_modes,preferred_languages,preferred_days,status) values($1,$2,$3,$4,$5,$6,$7,'requested') returning *",[menteeId,input.preferredMentorUserId||null,input.goals,JSON.stringify(normalizeArray(input.topics)),JSON.stringify(normalizeArray(input.preferredModes||["remote"])),JSON.stringify(normalizeArray(input.preferredLanguages)),JSON.stringify((input.preferredDays||[]).map(Number).filter(n=>n>=0&&n<=6))])).rows[0];
    await audit(db,menteeId,"mentorship.request_created","mentorship_request",row.id,requestId);
    return row;
  });
}

async function mentorCandidates(db,request){
  const mentors=(await db.query("select mp.*,p.display_name from mentor_profile mp join person p on p.user_id=mp.user_id where mp.status='active' and mp.visibility in ('members','public') and exists (select 1 from membership_record m where m.user_id=mp.user_id and m.status='active') and exists (select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=mp.user_id and vc.status='verified' and lower(vc.claim_code_snapshot)=any($1::text[])) and mp.user_id<>$2",[PROFESSIONAL_CLAIMS,request.mentee_user_id])).rows;
  const results=[];
  for(const m of mentors){
    const active=(await db.query("select count(*)::int count from mentorship where mentor_user_id=$1 and status in ('active','paused')",[m.user_id])).rows[0].count;
    if(active>=m.max_active_mentees) continue;
    const topics=JSON.parse(m.expertise||"[]"), langs=JSON.parse(m.languages||"[]"), modes=JSON.parse(m.mentoring_modes||"[]");
    const topicScore=overlap(topics,request.topics)*10;
    const languageScore=overlap(langs,request.preferred_languages)*5;
    const modeScore=overlap(modes,request.preferred_modes)*3;
    let dayScore=0;
    if(Array.isArray(request.preferred_days)&&request.preferred_days.length){
      const days=(await db.query("select distinct day_of_week from mentor_availability where mentor_profile_id=$1 and active=true",[m.id])).rows.map(x=>Number(x.day_of_week));
      dayScore=days.some(d=>request.preferred_days.map(Number).includes(d))?5:0;
    }
    const preferredBonus=request.preferred_mentor_user_id===m.user_id?100:0;
    results.push({mentorUserId:m.user_id,displayName:m.display_name,score:preferredBonus+topicScore+languageScore+modeScore+dayScore,reasons:[topicScore?"topic match":null,languageScore?"language match":null,modeScore?"mode match":null,dayScore?"availability match":null,preferredBonus?"preferred mentor":null].filter(Boolean)});
  }
  return results.sort((a,b)=>b.score-a.score);
}

export async function findMentorMatches(requestId,menteeId){
  const db=getPool(); const request=(await db.query("select * from mentorship_request where id=$1",[requestId])).rows[0];
  if(!request) throw error(404,"Mentorship request not found.","NOT_FOUND");
  if(request.mentee_user_id!==menteeId) throw error(403,"Only the mentee can inspect matches.","FORBIDDEN");
  if(["cancelled","declined","completed"].includes(request.status)) throw error(409,"This mentorship request is no longer matchable.","INVALID_STATE");
  const candidates=await mentorCandidates(db,request);
  return candidates.slice(0,20);
}

export async function proposeMentorMatch(requestId,mentorUserId,actorUserId,requestIdHeader){
  return withTransaction(async db=>{
    const request=(await db.query("select * from mentorship_request where id=$1 for update",[requestId])).rows[0];
    if(!request) throw error(404,"Mentorship request not found.","NOT_FOUND");
    if(request.mentee_user_id!==actorUserId && !(await activeMember(db,actorUserId))) throw error(403,"Only the mentee or an authorized matching actor may propose a match.","FORBIDDEN");
    if(["cancelled","completed"].includes(request.status)) throw error(409,"This mentorship request is closed.","INVALID_STATE");
    const candidates=await mentorCandidates(db,request); const match=candidates.find(x=>x.mentorUserId===mentorUserId);
    if(!match) throw error(409,"Selected mentor is not currently eligible or available.","MENTOR_UNAVAILABLE");
    const row=(await db.query("insert into mentorship_match(request_id,mentor_user_id,mentee_user_id,score,match_reasons,status) values($1,$2,$3,$4,$5,'proposed') on conflict(request_id) do update set mentor_user_id=excluded.mentor_user_id,score=excluded.score,match_reasons=excluded.match_reasons,status='proposed',proposed_at=now(),responded_at=null returning *",[requestId,mentorUserId,request.mentee_user_id,match.score,JSON.stringify(match.reasons)])).rows[0];
    await db.query("update mentorship_request set status='matched',matched_mentor_user_id=$1,matched_at=now(),updated_at=now() where id=$2",[mentorUserId,requestId]);
    await audit(db,actorUserId,"mentorship.match_proposed","mentorship_match",row.id,requestIdHeader,{mentorUserId,score:match.score});
    return row;
  });
}

export async function respondToMatch(matchId,mentorUserId,status,requestIdHeader){
  if(!["accepted","declined"].includes(status)) throw error(400,"Match response must be accepted or declined.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const match=(await db.query("select * from mentorship_match where id=$1 for update",[matchId])).rows[0];
    if(!match) throw error(404,"Mentorship match not found.","NOT_FOUND");
    if(match.mentor_user_id!==mentorUserId) throw error(403,"Only the proposed mentor can respond.","FORBIDDEN");
    if(match.status!=="proposed") throw error(409,"This match is no longer awaiting a response.","INVALID_STATE");
    const updated=(await db.query("update mentorship_match set status=$1,responded_at=now() where id=$2 returning *",[status,matchId])).rows[0];
    if(status==="accepted"){
      const existing=(await db.query("select id from mentorship where request_id=$1",[match.request_id])).rows[0];
      if(!existing){
        await db.query("insert into mentorship(request_id,mentor_user_id,mentee_user_id,goals,status) select request_id,mentor_user_id,mentee_user_id,mr.goals,'active' from mentorship_match mm join mentorship_request mr on mr.id=mm.request_id where mm.id=$1",[matchId]);
        await db.query("update mentorship_request set status='matched',matched_mentor_user_id=$1,updated_at=now() where id=$2",[mentorUserId,match.request_id]);
      }
    } else {
      await db.query("update mentorship_request set status='matching',matched_mentor_user_id=null,matched_at=null,updated_at=now() where id=$1",[match.request_id]);
    }
    await audit(db,mentorUserId,"mentorship.match_responded","mentorship_match",matchId,requestIdHeader,{status});
    return updated;
  });
}

async function mentorshipParticipant(db,mentorshipId,userId){
  const row=(await db.query("select * from mentorship where id=$1",[mentorshipId])).rows[0];
  if(!row) throw error(404,"Mentorship not found.","NOT_FOUND");
  if(row.mentor_user_id!==userId&&row.mentee_user_id!==userId) throw error(403,"You are not a participant in this mentorship.","FORBIDDEN");
  return row;
}

export async function changeMentorshipStatus(mentorshipId,userId,status,note,requestIdHeader){
  if(!["active","paused","completed","cancelled"].includes(status)) throw error(400,"Unsupported mentorship status.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(!allowedMentorshipTransition(m.status,status)) throw error(409,"Invalid mentorship lifecycle transition.","INVALID_STATE");
    const row=(await db.query("update mentorship set status=$1,paused_at=case when $1='paused' then now() else paused_at end,completed_at=case when $1='completed' then now() else completed_at end,cancelled_at=case when $1='cancelled' then now() else cancelled_at end,updated_at=now() where id=$2 returning *",[status,mentorshipId])).rows[0];
    await db.query("insert into mentorship_event(mentorship_id,actor_user_id,from_status,to_status,note) values($1,$2,$3,$4,$5)",[mentorshipId,userId,m.status,status,note||null]);
    await audit(db,userId,"mentorship.status_changed","mentorship",mentorshipId,requestIdHeader,{from:m.status,to:status});
    return row;
  });
}

export async function createMentorshipSession(mentorshipId,userId,input,requestId){
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(m.status!=="active") throw error(409,"Sessions can only be scheduled for an active mentorship.","MENTORSHIP_NOT_ACTIVE");
    if(!input.scheduledStartAt||!input.scheduledEndAt) throw error(400,"scheduledStartAt and scheduledEndAt are required.","VALIDATION_ERROR");
    const row=(await db.query("insert into mentorship_session(mentorship_id,scheduled_start_at,scheduled_end_at,mode,location_label,meeting_reference,agenda,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[mentorshipId,input.scheduledStartAt,input.scheduledEndAt,input.mode||"remote",input.locationLabel||null,input.meetingReference||null,input.agenda||null,userId])).rows[0];
    await audit(db,userId,"mentorship.session_created","mentorship_session",row.id,requestId);
    return row;
  });
}

export async function changeMentorshipSession(sessionId,userId,status,notes,requestId){
  if(!["completed","cancelled","no_show"].includes(status)) throw error(400,"Session status must be completed, cancelled or no_show.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const s=(await db.query("select s.*,m.mentor_user_id,m.mentee_user_id,m.status mentorship_status from mentorship_session s join mentorship m on m.id=s.mentorship_id where s.id=$1 for update",[sessionId])).rows[0];
    if(!s) throw error(404,"Mentorship session not found.","NOT_FOUND");
    if(s.mentor_user_id!==userId&&s.mentee_user_id!==userId) throw error(403,"You are not a session participant.","FORBIDDEN");
    if(!allowedSessionTransition(s.status,status)) throw error(409,"Invalid session transition.","INVALID_STATE");
    const row=(await db.query("update mentorship_session set status=$1,notes=coalesce($2,notes),completed_at=case when $1='completed' then now() else completed_at end,updated_at=now() where id=$3 returning *",[status,notes||null,sessionId])).rows[0];
    await audit(db,userId,"mentorship.session_status_changed","mentorship_session",sessionId,requestId,{from:s.status,to:status});
    return row;
  });
}

export async function listMentorshipSessions(mentorshipId,userId){
  const db=getPool(); await mentorshipParticipant(db,mentorshipId,userId);
  return (await db.query("select * from mentorship_session where mentorship_id=$1 order by scheduled_start_at",[mentorshipId])).rows;
}

export async function submitMentorshipFeedback(mentorshipId,userId,input,requestId){
  return withTransaction(async db=>{
    const m=await mentorshipParticipant(db,mentorshipId,userId);
    if(!input.targetRole||!["mentor","mentee","program"].includes(input.targetRole)) throw error(400,"Unsupported feedback target.","VALIDATION_ERROR");
    if(input.targetRole==="mentor"&&m.mentor_user_id===userId) throw error(400,"A mentor cannot rate themselves.","VALIDATION_ERROR");
    if(input.targetRole==="mentee"&&m.mentee_user_id===userId) throw error(400,"A mentee cannot rate themselves.","VALIDATION_ERROR");
    if(input.sessionId){
      const s=(await db.query("select status,mentorship_id from mentorship_session where id=$1",[input.sessionId])).rows[0];
      if(!s||s.mentorship_id!==mentorshipId) throw error(400,"Session does not belong to this mentorship.","VALIDATION_ERROR");
      if(s.status!=="completed") throw error(409,"Session feedback requires a completed session.","SESSION_NOT_COMPLETED");
    } else if(m.status!=="completed") {
      throw error(409,"Program feedback requires a completed mentorship.","MENTORSHIP_NOT_COMPLETED");
    }
    const row=(await db.query("insert into mentorship_feedback(mentorship_id,session_id,reviewer_user_id,target_role,rating,comments) values($1,$2,$3,$4,$5,$6) on conflict(session_id,reviewer_user_id,target_role) do update set rating=excluded.rating,comments=excluded.comments returning *",[mentorshipId,input.sessionId||null,userId,input.targetRole,input.rating??null,input.comments||null])).rows[0];
    await audit(db,userId,"mentorship.feedback_submitted","mentorship_feedback",row.id,requestId,{targetRole:input.targetRole,sessionId:input.sessionId||null});
    return row;
  });
}

export async function getMentorship(mentorshipId,userId){
  const db=getPool(); const m=await mentorshipParticipant(db,mentorshipId,userId);
  const sessions=(await db.query("select * from mentorship_session where mentorship_id=$1 order by scheduled_start_at",[mentorshipId])).rows;
  const feedback=(await db.query("select id,session_id,reviewer_user_id,target_role,rating,comments,created_at from mentorship_feedback where mentorship_id=$1 order by created_at desc",[mentorshipId])).rows;
  return {...m,sessions,feedback};
}

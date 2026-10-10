import { getPool } from "./db.js";

function statusLabel(status){
  const labels={submitted:"Submitted",in_review:"Under review",correction_required:"Correction required",payment_pending:"Payment required",paid:"Payment verified",activated:"Approved and active",rejected:"Rejected",draft:"Draft",pending:"Pending",verified:"Verified"};
  return labels[status]||String(status||"Unknown").replace(/_/g," ");
}

export async function getApplicationTracking(userId){
  const db=getPool();
  const [membership,organizations,jobs]=await Promise.all([
    db.query(`select a.id,a.application_type,a.status,a.submitted_at,a.reviewed_at,a.approved_at,a.activated_at,a.created_at,a.updated_at,p.product_code,p.name from membership_application a join membership_product p on p.id=a.membership_product_id where a.user_id=$1 order by a.created_at desc`,[userId]),
    db.query(`select o.id,o.display_name,o.legal_name,o.created_at,o.updated_at,coalesce(ov.status,'draft') verification_status,ov.submitted_at verification_submitted_at,ov.reviewed_at verification_reviewed_at,ov.reviewed_at verification_decision_at from organization o join organization_membership om on om.organization_id=o.id and om.user_id=$1 and om.status='active' left join lateral (select status,submitted_at,reviewed_at from organization_verification_case where organization_id=o.id order by created_at desc limit 1) ov on true order by o.created_at desc`,[userId]),
    db.query(`select a.id,a.status,a.created_at,a.updated_at,a.submitted_at,a.decided_at responded_at,j.id job_id,j.title,j.posting_scope,j.status job_status,o.display_name organization_name from job_application a join job j on j.id=a.job_id join organization o on o.id=j.organization_id where a.applicant_user_id=$1 order by a.created_at desc`,[userId])
  ]);
  const membershipItems=membership.rows.map(x=>({id:x.id,type:"membership",title:x.name||"MPA membership",subtitle:x.application_type==="renewal"?"Membership renewal":"Membership application",status:x.status,statusLabel:statusLabel(x.status),updatedAt:x.updated_at||x.created_at,submittedAt:x.submitted_at,nextAction:x.status==="correction_required"?"Respond to the correction request":x.status==="payment_pending"?"Submit the approved membership payment":x.status==="paid"?"Await activation":"No action required",details:{productCode:x.product_code,reviewedAt:x.reviewed_at,approvedAt:x.approved_at,activatedAt:x.activated_at}}));
  const organizationItems=organizations.rows.map(x=>({id:x.id,type:"organization",title:x.display_name||x.legal_name,subtitle:"Partner organization registration",status:x.verification_status,statusLabel:statusLabel(x.verification_status),updatedAt:x.updated_at||x.created_at,submittedAt:x.verification_submitted_at,nextAction:x.verification_status==="draft"?"Complete and submit organization verification":x.verification_status==="correction_required"?"Provide requested organization corrections":x.verification_status==="pending"?"Await organization review":"No action required",details:{legalName:x.legal_name,reviewedAt:x.verification_reviewed_at}}));
  const jobItems=jobs.rows.map(x=>({id:x.id,type:"job",title:x.title,subtitle:`Application · ${x.organization_name}`,status:x.status,statusLabel:statusLabel(x.status),updatedAt:x.updated_at||x.created_at,submittedAt:x.submitted_at,nextAction:x.status==="draft"?"Complete and submit application":["rejected","withdrawn"].includes(x.status)?"No action available":"Monitor recruitment progress",details:{jobId:x.job_id,jobStatus:x.job_status,organization:x.organization_name}}));
  const items=[...membershipItems,...organizationItems,...jobItems].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  return {items,summary:{total:items.length,active:items.filter(x=>!["rejected","withdrawn","activated","verified"].includes(x.status)).length,memberships:membershipItems.length,organizations:organizationItems.length,jobApplications:jobItems.length}};
}

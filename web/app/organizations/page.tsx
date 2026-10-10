"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {Building2,FileCheck2,RefreshCw,ShieldCheck,UsersRound} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Inquiry={id:string;public_reference:string;status:string;consider_non_member:boolean;contact_name:string;contact_email?:string;contact_phone?:string;intent:string;job_title?:string};
type Organization={id:string;legal_name:string;display_name:string;organization_type?:string;verification_status?:string;role_code?:string;created_at?:string};
type OrgForm={legalName:string;displayName:string;organizationType:string;description:string;website:string;email:string;phone:string;addressText:string};
const blank:OrgForm={legalName:"",displayName:"",organizationType:"",description:"",website:"",email:"",phone:"",addressText:""};
export default function Organizations(){
 const token=useUiStore(s=>s.token);
 const [inquiries,setInquiries]=useState<Inquiry[]>([]);
 const [organizations,setOrganizations]=useState<Organization[]>([]);
 const [form,setForm]=useState<OrgForm>(blank);
 const [showForm,setShowForm]=useState(false);
 const [loading,setLoading]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const load=useCallback(async()=>{
   if(!token){setOrganizations([]);setInquiries([]);return;}
   setLoading(true);setError("");
   const results=await Promise.allSettled([
     api<Organization[]>("/api/v1/organizations",{},token),
     api<Inquiry[]>("/api/v1/opportunity-inquiries?type=job",{},token)
   ]);
   const organizationResult=results[0];
   if(organizationResult.status==="fulfilled")setOrganizations(Array.isArray(organizationResult.value)?organizationResult.value:[]);
   else {const reason=organizationResult.reason;setError(reason instanceof ApiError?reason.message:"We couldn't load your organizations.");}
   const inquiryResult=results[1];
   if(inquiryResult.status==="fulfilled")setInquiries(Array.isArray(inquiryResult.value)?inquiryResult.value:[]);
   else {
     const reason=inquiryResult.reason;
     const message=reason instanceof ApiError&&reason.status!==403?reason.message:"";
     if(message)setError(current=>current||message);
   }
   setLoading(false);
 },[token]);
 useEffect(()=>{void load()},[load]);

 async function register(e:FormEvent){
   e.preventDefault();if(!token){setNotice("Sign in before registering an organization.");return;}
   setSubmitting(true);setError("");setNotice("");
   try{
     const created=await api<Organization>("/api/v1/organizations",{method:"POST",body:JSON.stringify({
       legalName:form.legalName.trim(),displayName:form.displayName.trim(),
       organizationType:form.organizationType.trim()||undefined,
       description:form.description.trim()||undefined,website:form.website.trim()||undefined,
       email:form.email.trim()||undefined,phone:form.phone.trim()||undefined,addressText:form.addressText.trim()||undefined
     })},token);
     setOrganizations(current=>[created,...current.filter(x=>x.id!==created.id)]);
     setForm(blank);setShowForm(false);
     setNotice("Organization registered. It is not verified yet; publishing privileges remain subject to the verification workflow.");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't register this organization.");}
   finally{setSubmitting(false);}
 }
 async function submitVerification(org:Organization){
   if(!token)return;
   setError("");setNotice("");
   try{
     const result=await api<Organization>("/api/v1/organizations/"+encodeURIComponent(org.id)+"/submit-verification",{method:"POST"},token);
     setOrganizations(current=>current.map(item=>item.id===org.id?{...item,...result}:item));
     setNotice("Verification submission was accepted by the server. Check the displayed status for the next step.");
     await load();
   }catch(e){setError(e instanceof ApiError?e.message:"Verification could not be submitted. Check required evidence and the current case state.");}
 }

 return <div className="grid">
   <div><div className="eyebrow">Partner workspace</div><h1 className="h1">Build a trusted organization profile.</h1><p className="muted">Register an organization, review its current verification state and continue through server-governed due diligence. Verified status is never assumed by the interface.</p></div>
   {!token?<Card><h2 className="h2">Sign in to manage an organization</h2><p className="muted">Organization registration and private inquiries require an authenticated account.</p><a className="btn btn-primary" href="/login?next=/organizations">Sign in</a></Card>:<>
     <Card id="org-registration"><div className="row"><div><div className="h2">Organization registration</div><p className="muted">Legal identity, organization type and contact information.</p></div><Building2 color="var(--primary)"/></div>
       <button className="btn btn-primary" type="button" onClick={()=>{setShowForm(v=>!v);setError("");setNotice("");}}>{showForm?"Close registration form":"Register an organization"}</button>
       {showForm&&<form className="form-stack" onSubmit={register} style={{marginTop:18}}>
         <label>Legal name<input required value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})}/></label>
         <label>Display name<input required value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></label>
         <label>Organization type<input value={form.organizationType} onChange={e=>setForm({...form,organizationType:e.target.value})} placeholder="e.g. company, association, NGO"/></label>
         <label>Description<textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
         <div className="form-grid"><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label></div>
         <label>Website<input type="url" value={form.website} onChange={e=>setForm({...form,website:e.target.value})} placeholder="https://"/></label>
         <label>Address<input value={form.addressText} onChange={e=>setForm({...form,addressText:e.target.value})}/></label>
         <p className="muted">Registration creates a draft verification case. It does not automatically verify the organization or permit job publication.</p>
         <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?"Registering…":"Submit organization registration"}</button>
       </form>}
     </Card>
     <Card><div className="row"><div><div className="h2">Your organizations</div><p className="muted">Only organizations associated with your authenticated account are shown.</p></div><button className="btn btn-ghost" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>{loading?"Loading…":"Refresh"}</button></div>
       {loading&&<p className="muted">Loading your organizations…</p>}
       {!loading&&organizations.length===0&&<p className="muted">No organization is linked to this account yet. Use registration above to begin.</p>}
       <div className="grid">{organizations.map(org=><div className="case-row" key={org.id}><div className="row"><div><b>{org.display_name}</b><div className="muted">{org.legal_name}{org.role_code?" · "+org.role_code:""}</div></div><Badge>{(org.verification_status||"unverified").replaceAll("_"," ")}</Badge></div>
         <p className="muted">Verification evidence is private and must satisfy the active server-side requirements.</p>
         <button className="btn btn-ghost" type="button" onClick={()=>void submitVerification(org)}>Submit for verification</button>
       </div>)}</div>
     </Card>
     <Card id="org-evidence"><div className="row"><div><div className="h2">Verification evidence</div><p className="muted">The API accepts only a private file object owned by the submitting user. This screen does not yet provide a complete file-upload flow, so do not paste public URLs or mark evidence as uploaded. The UI upload integration remains an open Gate 4 item.</p></div><FileCheck2 color="var(--primary)"/></div><Badge>Tabayyun · Verification / due diligence</Badge></Card>
     <Card><div className="row"><div><div className="h2">Public job inquiries</div><p className="muted">First-stage public interest is not a formal eligible application. Only authorized organization users can inspect and decide inquiries.</p></div><UsersRound color="var(--primary)"/></div>
       {loading?<p className="muted">Loading inquiries…</p>:inquiries.length===0?<p className="muted">No public job inquiries are currently visible to this account.</p>:<div className="grid">{inquiries.map(i=><div className="case-row" key={i.id}><div><div className="row" style={{justifyContent:"flex-start"}}><b>{i.contact_name}</b><Badge>{i.status}</Badge>{i.consider_non_member&&<Badge tone="gold">Non-member considered</Badge>}</div><div className="muted">{i.job_title||"General public job interest"} · {i.contact_email||i.contact_phone}</div><p className="muted" style={{margin:"6px 0"}}>{i.intent}</p><small className="muted">Reference {i.public_reference}</small></div></div>)}</div>}
     </Card>
   </>}
   {error&&<div className="form-error" role="alert">{error}</div>}
   {notice&&<p className="muted" role="status">{notice}</p>}
   <Card><div className="row"><div><div className="h2">Decision boundary</div><p className="muted">Verified organizations can publish opportunities and manage partner workflows. Public inquiries remain an intake signal until an authorized person moves them into the formal process.</p></div><ShieldCheck color="var(--primary)"/></div></Card>
 </div>;
}

"use client";
import {FormEvent,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight,Building2,RefreshCw,UserRound} from "lucide-react";
import {Card} from "../../components/ui";
import {api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type HumanChallenge={id:string;question:string;expiresAt:string};
type ChallengeToken={token:string;expiresInSeconds:number};
type RegistrationResult={token?:string;verificationRequired?:boolean;verificationSent?:boolean;registrationReference?:string;developmentVerificationUrl?:string};
type OrganizationDraft={legalName:string;displayName:string;organizationType:string;email:string;phone:string;addressText:string;website:string;description:string};
export default function Register(){
 const router=useRouter();
 const setToken=useUiStore(s=>s.setToken);
 const [form,setForm]=useState({email:"",password:"",firstName:"",middleName:"",lastName:"",displayName:"",phone:"",nationality:"Ethiopian"});
 const [passwordConfirmation,setPasswordConfirmation]=useState("");
 const [organization,setOrganization]=useState<OrganizationDraft>({legalName:"",displayName:"",organizationType:"company",email:"",phone:"",addressText:"",website:"",description:""});
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [kind,setKind]=useState<"professional"|"organization">("professional");
 const [challenge,setChallenge]=useState<HumanChallenge|null>(null);
 const [challengeAnswer,setChallengeAnswer]=useState("");
 const [challengeBusy,setChallengeBusy]=useState(false);
 const [registrationReference,setRegistrationReference]=useState("");
 const [registrationUpdatedAt,setRegistrationUpdatedAt]=useState("");
 const [accountReady,setAccountReady]=useState(false);
 const [continuePath,setContinuePath]=useState("/apply");
 const [verificationMessage,setVerificationMessage]=useState("");
 const [verificationUrl,setVerificationUrl]=useState("");
 const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));
 async function loadChallenge(){
   setChallengeBusy(true);setChallengeAnswer("");setChallenge(null);
   try{setChallenge(await api<HumanChallenge>("/api/v1/security/human-challenge",{method:"POST"}));}
   catch(e){setError(e instanceof Error?e.message:"Could not load the human check.");}
   finally{setChallengeBusy(false);}
 }
 useEffect(()=>{void loadChallenge();},[]);
 async function submit(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");setVerificationMessage("");setVerificationUrl("");
   try{
     if(form.password!==passwordConfirmation)throw new Error("Password confirmation does not match.");
     if(kind==="organization"){
       if(!organization.legalName.trim()||!organization.displayName.trim()||!organization.addressText.trim()||!organization.email.trim()||!organization.phone.trim())throw new Error("Complete the organization legal name, public name, location, work email and contact phone.");
       sessionStorage.setItem("mpa-organization-registration-draft",JSON.stringify({...organization,representativeFirstName:form.firstName,representativeLastName:form.lastName,representativeEmail:form.email,representativePhone:form.phone}));
     }
     if(!challenge)throw new Error("Load a new human check before registering.");
     const proof=await api<ChallengeToken>("/api/v1/security/human-challenge/verify",{method:"POST",body:JSON.stringify({id:challenge.id,answer:challengeAnswer})});
     const r=await api<RegistrationResult>("/api/v1/auth/register",{method:"POST",body:JSON.stringify({...form,displayName:kind==="organization"?[form.firstName,form.middleName,form.lastName].filter(Boolean).join(" "):form.displayName,passwordConfirmation,humanCheckToken:proof.token})});
     if(r.verificationRequired){
       setRegistrationReference(r.registrationReference||"");
       setRegistrationUpdatedAt(new Date().toISOString());
       setVerificationMessage(r.verificationSent?"Your account is created but sign-in is blocked until you verify your email. Check your inbox and spam folder.":"Your account is created, but the verification email could not be confirmed as delivered. Use the resend option on the login page or contact support if it does not arrive.");
       setVerificationUrl(r.developmentVerificationUrl||"");
       return;
     }
     if(!r.token)throw new Error("Registration did not return a session or verification instructions.");
     setToken(r.token);setRegistrationReference(r.registrationReference||"");setRegistrationUpdatedAt(new Date().toISOString());setContinuePath(kind==="professional"?"/apply":"/organizations?register=1");setAccountReady(true);
   }catch(err){setError(err instanceof Error?err.message:"Registration failed");await loadChallenge();}
   finally{setBusy(false);}
 }
 if(accountReady)return <div className="auth-page"><Card><div className="eyebrow">Registration complete</div><h1 className="h1">Your account is ready</h1><p className="muted">Keep this human-readable reference for support and account follow-up. It is not a password or sign-in credential.</p>{registrationReference&&<p>Registration reference: <strong>{registrationReference}</strong></p>}<div className="track-card-grid"><div><span>Current status</span><b>Account created</b></div><div><span>Last updated</span><b>{registrationUpdatedAt?new Date(registrationUpdatedAt).toLocaleString():"Just now"}</b></div><div><span>Next required action</span><b>{kind==="professional"?"Continue to your membership application":"Review and submit the organization profile and required evidence"}</b></div></div><button className="btn btn-primary" onClick={()=>router.replace(continuePath)}>Continue <ArrowRight size={16}/></button></Card></div>;
 if(verificationMessage)return <div className="auth-page"><Card><div className="eyebrow">Email verification</div><h1 className="h1">Check your email</h1><p className="muted">{verificationMessage}</p>{registrationReference&&<p>Registration reference: <strong>{registrationReference}</strong></p>}<div className="track-card-grid"><div><span>Current status</span><b>Email verification required</b></div><div><span>Last updated</span><b>{registrationUpdatedAt?new Date(registrationUpdatedAt).toLocaleString():"Just now"}</b></div><div><span>Next required action</span><b>Open the verification link sent to your email, then sign in to continue</b></div></div>{verificationUrl&&<p><a className="btn btn-primary" href={verificationUrl}>Verify email (development only)</a></p>}<div className="auth-links"><a href="/login">Continue to login</a></div></Card></div>;
 return <div className="auth-page"><Card><div className="eyebrow">Join the ecosystem</div><h1 className="h1">Create your account</h1><p className="muted">Choose the entry path you need. Professionals continue into membership tracking, while organization representatives move into organization registration. Email verification may be required before sign-in.</p><div className="choice-grid" style={{marginBottom:18}}><button type="button" className={kind==="professional"?"choice active":"choice"} onClick={()=>setKind("professional")}><UserRound/><b>Professional</b><span>Create a trusted member profile and continue to membership application tracking.</span></button><button type="button" className={kind==="organization"?"choice active":"choice"} onClick={()=>setKind("organization")}><Building2/><b>Organization</b><span>Create your representative account and open organization registration.</span></button></div><form onSubmit={submit} className="form-stack"><div className="eyebrow">{kind==="organization"?"Responsible representative":"Professional profile"}</div><div className="form-grid"><label>First name<input required value={form.firstName} onChange={e=>set("firstName",e.target.value)} autoComplete="given-name"/></label><label>Middle / father name<input value={form.middleName} onChange={e=>set("middleName",e.target.value)} autoComplete="additional-name"/></label><label>Last / grandfather name<input required value={form.lastName} onChange={e=>set("lastName",e.target.value)} autoComplete="family-name"/></label></div>{kind==="professional"&&<label>Display name<input required value={form.displayName} onChange={e=>set("displayName",e.target.value)}/></label>}<div className="form-grid"><label>{kind==="organization"?"Representative work email":"Email"}<input required type="email" autoComplete="email" value={form.email} onChange={e=>set("email",e.target.value)}/></label><label>Contact phone<input required autoComplete="tel" value={form.phone} onChange={e=>set("phone",e.target.value)}/></label></div>{kind==="organization"&&<div className="form-stack" style={{border:"1px solid var(--border)",borderRadius:12,padding:16}}><h2 className="h2">Organization details</h2><p className="muted">This creates the representative account first. After email verification, you will review and submit the organization profile and any required evidence. Organization approval is a separate review decision.</p><label>Legal or registered organization name<input required value={organization.legalName} onChange={e=>setOrganization(v=>({...v,legalName:e.target.value}))} autoComplete="organization"/></label><label>Public/display name<input required value={organization.displayName} onChange={e=>setOrganization(v=>({...v,displayName:e.target.value}))}/></label><label>Organization type<select required value={organization.organizationType} onChange={e=>setOrganization(v=>({...v,organizationType:e.target.value}))}><option value="company">Company / business</option><option value="nonprofit">Non-profit / association</option><option value="educational">Educational institution</option><option value="public">Public institution</option><option value="other">Other</option></select></label><label>Registered location / address<textarea required rows={3} value={organization.addressText} onChange={e=>setOrganization(v=>({...v,addressText:e.target.value}))} placeholder="City, sub-city, woreda and street/address"/></label><div className="form-grid"><label>Organization work email<input required type="email" autoComplete="organization" value={organization.email} onChange={e=>setOrganization(v=>({...v,email:e.target.value}))}/></label><label>Organization phone<input required type="tel" autoComplete="tel-national" value={organization.phone} onChange={e=>setOrganization(v=>({...v,phone:e.target.value}))}/></label></div><label>Website (optional)<input type="url" value={organization.website} onChange={e=>setOrganization(v=>({...v,website:e.target.value}))} placeholder="https://"/></label><label>Organization description (optional)<textarea rows={3} value={organization.description} onChange={e=>setOrganization(v=>({...v,description:e.target.value}))}/></label><p className="muted">Registered certificate, license or other required evidence is uploaded securely in the organization verification step after email verification. Your representative account does not automatically approve the organization.</p></div>}<label>Password<input required minLength={10} type="password" autoComplete="new-password" value={form.password} onChange={e=>set("password",e.target.value)}/></label><label>Confirm password<input required minLength={10} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={e=>setPasswordConfirmation(e.target.value)}/></label><p className="muted">Use at least 10 characters. Your password confirmation is checked before submission.</p><div className="form-stack" style={{border:"1px solid var(--border)",borderRadius:12,padding:14}}><b>Verify you are human</b>{challenge?<label>{challenge.question}<input required inputMode="numeric" value={challengeAnswer} onChange={e=>setChallengeAnswer(e.target.value)} autoComplete="off" placeholder="Enter your answer"/></label>:<p className="muted">Loading human check…</p>}<button type="button" className="btn btn-ghost" onClick={()=>void loadChallenge()} disabled={challengeBusy}><RefreshCw size={16}/> {challengeBusy?"Loading…":"Get a new question"}</button><p className="muted">This first-party check helps deter simple automated submissions. It is not a guarantee against bots or denial-of-service attacks.</p></div>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary" disabled={busy||challengeBusy||!challenge}>{busy?"Creating account…":kind==="professional"?"Create professional account":"Continue to organization registration"} <ArrowRight size={16}/></button></form><div className="auth-links"><a href="/login">Already have an account? Login</a></div></Card></div>
}

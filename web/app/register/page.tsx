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
export default function Register(){
 const router=useRouter();
 const setToken=useUiStore(s=>s.setToken);
 const [form,setForm]=useState({email:"",password:"",firstName:"",middleName:"",lastName:"",displayName:"",phone:"",nationality:"Ethiopian"});
 const [passwordConfirmation,setPasswordConfirmation]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [kind,setKind]=useState<"professional"|"organization">("professional");
 const [challenge,setChallenge]=useState<HumanChallenge|null>(null);
 const [challengeAnswer,setChallengeAnswer]=useState("");
 const [challengeBusy,setChallengeBusy]=useState(false);
 const [registrationReference,setRegistrationReference]=useState("");
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
     if(!challenge)throw new Error("Load a new human check before registering.");
     const proof=await api<ChallengeToken>("/api/v1/security/human-challenge/verify",{method:"POST",body:JSON.stringify({id:challenge.id,answer:challengeAnswer})});
     const r=await api<RegistrationResult>("/api/v1/auth/register",{method:"POST",body:JSON.stringify({...form,passwordConfirmation,humanCheckToken:proof.token})});
     if(r.verificationRequired){
       setRegistrationReference(r.registrationReference||"");
       setVerificationMessage(r.verificationSent?"Your account is created but sign-in is blocked until you verify your email. Check your inbox and spam folder.":"Your account is created, but the verification email could not be confirmed as delivered. Use the resend option on the login page or contact support if it does not arrive.");
       setVerificationUrl(r.developmentVerificationUrl||"");
       return;
     }
     if(!r.token)throw new Error("Registration did not return a session or verification instructions.");
     setToken(r.token);router.replace(kind==="professional"?"/apply":"/organizations?register=1");
   }catch(err){setError(err instanceof Error?err.message:"Registration failed");await loadChallenge();}
   finally{setBusy(false);}
 }
 if(verificationMessage)return <div className="auth-page"><Card><div className="eyebrow">Email verification</div><h1 className="h1">Check your email</h1><p className="muted">{verificationMessage}</p>{registrationReference&&<p>Registration reference: <strong>{registrationReference}</strong></p>}{verificationUrl&&<p><a className="btn btn-primary" href={verificationUrl}>Verify email (development only)</a></p>}<div className="auth-links"><a href="/login">Continue to login</a></div></Card></div>;
 return <div className="auth-page"><Card><div className="eyebrow">Join the ecosystem</div><h1 className="h1">Create your account</h1><p className="muted">Choose the entry path you need. Professionals continue into membership tracking, while organization representatives move into organization registration. Email verification may be required before sign-in.</p><div className="choice-grid" style={{marginBottom:18}}><button type="button" className={kind==="professional"?"choice active":"choice"} onClick={()=>setKind("professional")}><UserRound/><b>Professional</b><span>Create a trusted member profile and continue to membership application tracking.</span></button><button type="button" className={kind==="organization"?"choice active":"choice"} onClick={()=>setKind("organization")}><Building2/><b>Organization</b><span>Create your representative account and open organization registration.</span></button></div><form onSubmit={submit} className="form-stack"><div className="form-grid"><label>First name<input required value={form.firstName} onChange={e=>set("firstName",e.target.value)} autoComplete="given-name"/></label><label>Last name<input required value={form.lastName} onChange={e=>set("lastName",e.target.value)} autoComplete="family-name"/></label></div><label>Display name<input required value={form.displayName} onChange={e=>set("displayName",e.target.value)}/></label><div className="form-grid"><label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e=>set("email",e.target.value)}/></label><label>Phone<input required autoComplete="tel" value={form.phone} onChange={e=>set("phone",e.target.value)}/></label></div><label>Password<input required minLength={10} type="password" autoComplete="new-password" value={form.password} onChange={e=>set("password",e.target.value)}/></label><label>Confirm password<input required minLength={10} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={e=>setPasswordConfirmation(e.target.value)}/></label><p className="muted">Use at least 10 characters. Your password confirmation is checked before submission.</p><div className="form-stack" style={{border:"1px solid var(--border)",borderRadius:12,padding:14}}><b>Verify you are human</b>{challenge?<label>{challenge.question}<input required inputMode="numeric" value={challengeAnswer} onChange={e=>setChallengeAnswer(e.target.value)} autoComplete="off" placeholder="Enter your answer"/></label>:<p className="muted">Loading human check…</p>}<button type="button" className="btn btn-ghost" onClick={()=>void loadChallenge()} disabled={challengeBusy}><RefreshCw size={16}/> {challengeBusy?"Loading…":"Get a new question"}</button><p className="muted">This first-party check helps deter simple automated submissions. It is not a guarantee against bots or denial-of-service attacks.</p></div>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary" disabled={busy||challengeBusy||!challenge}>{busy?"Creating account…":kind==="professional"?"Create professional account":"Continue to organization registration"} <ArrowRight size={16}/></button></form><div className="auth-links"><a href="/login">Already have an account? Login</a></div></Card></div>
}

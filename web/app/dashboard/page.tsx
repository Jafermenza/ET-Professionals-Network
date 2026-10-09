"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight,BriefcaseBusiness,ClipboardList,LogOut,RefreshCw,ShieldCheck,UserRound} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Profile={email:string;display_name?:string;first_name?:string;last_name?:string;completion_percent?:number;status?:string};
type TrackingItem={id:string;type:string;title:string;subtitle?:string;status:string;statusLabel?:string;updatedAt?:string;nextAction?:string};
type Tracking={summary?:{total?:number;active?:number;jobApplications?:number};items?:TrackingItem[]};

export default function Dashboard(){
  const router=useRouter();
  const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated),clearToken=useUiStore(s=>s.clearToken);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [tracking,setTracking]=useState<Tracking|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  async function load(){
    if(!token)return;
    setLoading(true);setError("");
    try{
      const [me,items]=await Promise.all([
        api<Profile>("/api/v1/me",{},token),
        api<Tracking>("/api/v1/me/application-tracking",{},token)
      ]);
      setProfile(me);setTracking(items);
    }catch(e){
      setError(e instanceof Error?e.message:"We could not load your workspace. Please try again.");
    }finally{setLoading(false)}
  }
  useEffect(()=>{if(hydrated&&token)void load();else if(hydrated){setProfile(null);setTracking(null)}},[token,hydrated]);
  async function logout(){
    try{if(token)await api("/api/v1/auth/logout",{method:"POST"},token)}catch{/* Clear the local session even if the server session has already expired. */}
    clearToken();router.replace("/login");
  }
  if(!hydrated)return <div className="auth-page"><Card><h1 className="h1">Restoring your session…</h1><p className="muted">Please wait while we check this browser session.</p></Card></div>;
  if(!token)return <div className="auth-page"><Card><div className="eyebrow">Member workspace</div><h1 className="h1">Sign in to your dashboard.</h1><p className="muted">Your dashboard brings your profile and application progress together. Sign in to see your private information.</p><div className="landing-actions"><a className="btn btn-primary" href="/login">Sign in</a><a className="btn btn-ghost" href="/register">Create account</a></div></Card></div>;
  const name=profile?.display_name||[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||profile?.email||"Your workspace";
  return <div className="grid" style={{gap:20}}>
    <div className="row"><div><div className="eyebrow">Member workspace</div><h1 className="h1">Welcome, {name}.</h1><p className="muted">Your account, applications and next steps in one place.</p></div><button className="btn btn-ghost" onClick={logout}><LogOut size={16}/> Sign out</button></div>
    {error&&<div className="form-error" role="alert">{error} <button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw size={15}/> Try again</button></div>}
    <div className="grid grid-3">
      <Card><UserRound color="var(--primary)"/><div className="eyebrow">Profile completion</div><div className="metric">{profile?.completion_percent??0}%</div><a className="btn btn-ghost" href="/profile">Review profile <ArrowRight size={15}/></a></Card>
      <Card><ClipboardList color="var(--primary)"/><div className="eyebrow">Applications</div><div className="metric">{tracking?.summary?.total??tracking?.items?.length??0}</div><a className="btn btn-ghost" href="/track">View application tracking <ArrowRight size={15}/></a></Card>
      <Card><ShieldCheck color="var(--primary)"/><div className="eyebrow">Account status</div><div className="h2">{profile?.status||"Loading…"}</div><p className="muted">Private profile and application details are available only to your authenticated account.</p></Card>
    </div>
    <div className="row"><div><h2 className="h2">Your recent applications</h2><p className="muted">Current status and the next useful action.</p></div><button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw size={15}/> {loading?"Refreshing…":"Refresh"}</button></div>
    {!tracking&&!error&&<Card><p className="muted">{loading?"Loading your applications…":"Your application summary will appear here."}</p></Card>}
    {tracking?.items?.length? <div className="grid">{tracking.items.slice(0,5).map(item=><Card key={item.type+item.id}><div className="row"><div><Badge>{item.type}</Badge><h3 className="h2" style={{margin:"8px 0 4px"}}>{item.title}</h3><p className="muted">{item.subtitle||"Application progress"}</p></div><Badge tone="slate">{item.statusLabel||item.status}</Badge></div><div className="row"><span className="muted">Next action: {item.nextAction||"Check tracking for updates"}</span></div></Card>)}</div>:null}
    {tracking&&(!tracking.items||tracking.items.length===0)&&<Card><h2 className="h2">No applications yet</h2><p className="muted">Choose a path to begin. Your application status will appear here after submission.</p><div className="landing-actions"><a className="btn btn-primary" href="/apply">Start membership application</a><a className="btn btn-ghost" href="/apply/job"><BriefcaseBusiness size={16}/> Explore job applications</a></div></Card>}
    <div className="landing-actions"><a className="btn btn-primary" href="/apply">Apply / membership</a><a className="btn btn-ghost" href="/jobs">Browse opportunities</a><a className="btn btn-ghost" href="/profile">Profile settings</a><a className="btn btn-ghost" href="/track">Application tracking</a></div>
  </div>;
}

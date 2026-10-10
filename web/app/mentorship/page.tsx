"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {Clock3,HeartHandshake,Languages,RefreshCw,Target} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Mentor={id:string;user_id:string;display_name:string;headline?:string;bio?:string;expertise?:string[]|string;languages?:string[]|string;mentoring_modes?:string[]|string;max_active_mentees?:number};
type RequestResult={id:string;status:string;goals?:string};
function values(value:unknown):string[]{if(Array.isArray(value))return value.map(String);if(typeof value==="string"){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(String)}catch{}return value?[value]:[]}return []}
export default function Mentorship(){
 const token=useUiStore(s=>s.token);
 const [mentors,setMentors]=useState<Mentor[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Mentor|null>(null);
 const [query,setQuery]=useState("");
 const [topic,setTopic]=useState("");
 const [goals,setGoals]=useState("");
 const [topics,setTopics]=useState("");
 const [languages,setLanguages]=useState("");
 const [mode,setMode]=useState("remote");
 const [submitting,setSubmitting]=useState(false);
 const [created,setCreated]=useState<RequestResult|null>(null);

 const load=useCallback(async()=>{
   setLoading(true);setError("");
   const params=new URLSearchParams();if(query.trim())params.set("q",query.trim());if(topic.trim())params.set("topic",topic.trim());
   try{
     const result=await api<Mentor[]>(`/api/v1/mentors${params.toString()?"?"+params.toString():""}`,{},token||undefined);
     setMentors(Array.isArray(result)?result:[]);
   }catch(e){setMentors([]);setError(e instanceof ApiError?e.message:"We couldn't load mentor profiles right now.");}
   finally{setLoading(false);}
 },[query,topic,token]);
 useEffect(()=>{void load()},[load]);

 async function submit(e:FormEvent){
   e.preventDefault();setError("");setNotice("");
   if(!token){setNotice("Sign in with an active membership to submit a formal mentorship request.");return;}
   if(!goals.trim()){setError("Describe the goal you want mentorship to help you achieve.");return;}
   setSubmitting(true);
   try{
     const result=await api<RequestResult>("/api/v1/mentorship/requests",{method:"POST",body:JSON.stringify({
       goals:goals.trim(),
       preferredMentorUserId:selected?.user_id||null,
       topics:topics.split(",").map(x=>x.trim()).filter(Boolean),
       preferredModes:[mode],
       preferredLanguages:languages.split(",").map(x=>x.trim()).filter(Boolean)
     })},token);
     setCreated(result);setNotice("Your mentorship request was recorded. Matching and mentor acceptance remain explicit next steps.");
     setSelected(null);setGoals("");setTopics("");setLanguages("");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't submit your mentorship request.");}
   finally{setSubmitting(false);}
 }

 return <div>
   <div className="eyebrow">Mentorship match</div><h1 className="h1">One goal. One good match.</h1>
   <p className="muted">Discover current mentor profiles and submit a goal-based request. We show only details returned by the platform; availability and matching are not guessed or guaranteed.</p>
   <Card><form onSubmit={e=>{e.preventDefault();void load()}} className="row" style={{gap:10,flexWrap:"wrap"}}>
     <label style={{flex:"1 1 220px"}}>Search expertise<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mentor headline or bio"/></label>
     <label style={{flex:"1 1 180px"}}>Topic<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Expertise topic"/></label>
     <button className="btn btn-primary" type="submit" disabled={loading}>{loading?"Searching…":"Search mentors"}</button>
     <button className="btn btn-ghost" type="button" onClick={()=>{setQuery("");setTopic("")}}>Clear</button>
   </form></Card>
   {error&&<div className="form-error" role="alert">{error}<button className="btn btn-ghost" type="button" onClick={()=>void load()}>Retry</button></div>}
   {notice&&<p className="muted" role="status">{notice}{!token&&<a href="/login?next=/mentorship"> Sign in</a>}</p>}
   {created&&<Card><Badge tone="green">Request recorded</Badge><h2 className="h2" style={{marginTop:10}}>Your request is in the system</h2><p className="muted">Request reference: {created.id}</p><p className="muted">Status: {created.status}. The platform does not create a mentorship until the matching and acceptance steps are completed.</p><button className="btn btn-ghost" type="button" onClick={()=>setCreated(null)}>Dismiss</button></Card>}
   {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading active mentor profiles…</p></div></Card>:mentors.length===0&&!error?<Card><h2 className="h2">No active mentor profiles found</h2><p className="muted">Try a different topic or return later. We do not display placeholder mentors.</p></Card>:<div className="grid grid-3" style={{marginTop:18}}>{mentors.map(mentor=><Card key={mentor.user_id}>
     <div className="row"><div className="avatar">{mentor.display_name.split(" ").map(x=>x[0]).join("").slice(0,3)}</div><Badge>Active profile</Badge></div>
     <h2 style={{fontSize:19,marginBottom:4,marginTop:14}}>{mentor.display_name}</h2><div className="tagline">{mentor.headline||"Professional mentor"}</div>
     {mentor.bio&&<p className="muted">{mentor.bio}</p>}
     {values(mentor.expertise).length>0&&<div style={{marginTop:12}}><b>Expertise</b><p className="muted">{values(mentor.expertise).join(" · ")}</p></div>}
     {values(mentor.languages).length>0&&<div className="tagline"><Languages size={14}/> {values(mentor.languages).join(" · ")}</div>}
     {values(mentor.mentoring_modes).length>0&&<div className="tagline" style={{marginTop:8}}><Clock3 size={14}/> {values(mentor.mentoring_modes).join(" · ")}</div>}
     <button className="btn btn-primary" type="button" style={{width:"100%",marginTop:17}} onClick={()=>{setSelected(mentor);setCreated(null);setGoals("");setNotice("");}}>Request mentorship <HeartHandshake size={16}/></button>
   </Card>)}</div>}
   {selected&&<Card id="mentor-goal"><div className="row"><div><div className="eyebrow">Mentorship request</div><h2 className="h2">Goal and preferences</h2><p className="muted">Preferred mentor: {selected.display_name}</p></div><button className="btn btn-ghost" type="button" onClick={()=>setSelected(null)}>Close</button></div>
     {!token?<><p className="muted">A formal request requires sign-in and active membership. You can still explore mentor profiles.</p><a className="btn btn-primary" href="/login?next=/mentorship">Sign in to continue</a></>:<form className="form-stack" onSubmit={submit}>
       <label>Your mentorship goal<textarea required rows={4} value={goals} onChange={e=>setGoals(e.target.value)} placeholder="What outcome do you want help achieving?"/></label>
       <label>Topics, separated by commas<input value={topics} onChange={e=>setTopics(e.target.value)} placeholder="e.g. product leadership, finance"/></label>
       <label>Preferred languages, separated by commas<input value={languages} onChange={e=>setLanguages(e.target.value)} placeholder="e.g. Amharic, English"/></label>
       <label>Preferred mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value="remote">Remote</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></label>
       <p className="muted">Submitting records a request; it does not automatically confirm a match or schedule a session.</p>
       <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?"Submitting…":"Submit mentorship request"} <Target size={16}/></button>
     </form>}
   </Card>}
   <div className="footer-note">The matching score is not invented in this interface. Human governance and explicit acceptance remain authoritative.</div>
 </div>;
}

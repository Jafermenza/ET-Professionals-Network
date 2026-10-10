"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {Handshake,MessageSquareText,RefreshCw,Star} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Service={id:string;title:string;description:string;service_category:string;delivery_mode?:string;location_label?:string;pricing_model:string;price_amount?:number|string|null;currency?:string|null;display_name?:string;provider_name?:string};
type ServiceRequest={id:string;status:string;service_title?:string;created_at?:string;message?:string};
export default function Services(){
 const token=useUiStore(s=>s.token);
 const [items,setItems]=useState<Service[]>([]);
 const [requests,setRequests]=useState<ServiceRequest[]>([]);
 const [query,setQuery]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Service|null>(null);
 const [message,setMessage]=useState("");
 const [submitting,setSubmitting]=useState(false);

 const load=useCallback(async(q="")=>{
   setLoading(true);setError("");
   try{
     const params=new URLSearchParams();if(q.trim())params.set("q",q.trim());
     const result=await api<{items:Service[]}>("/api/v1/services"+(params.size?"?"+params.toString():""));
     setItems(Array.isArray(result?.items)?result.items:[]);
   }catch(e){setItems([]);setError(e instanceof ApiError?e.message:"We couldn't load services right now.");}
   finally{setLoading(false);}
 },[]);
 const loadRequests=useCallback(async()=>{
   if(!token){setRequests([]);return;}
   try{const result=await api<ServiceRequest[]>("/api/v1/me/service-requests",{},token);setRequests(Array.isArray(result)?result:[]);}
   catch(e){setError(e instanceof ApiError?e.message:"We couldn't load your service requests.");}
 },[token]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{void loadRequests();},[loadRequests]);

 async function submitRequest(e:FormEvent){
   e.preventDefault();if(!selected)return;
   if(!token){setNotice("Sign in with an active membership to request a service.");return;}
   setSubmitting(true);setError("");setNotice("");
   try{
     const created=await api<ServiceRequest>("/api/v1/services/"+encodeURIComponent(selected.id)+"/requests",{method:"POST",body:JSON.stringify({message:message.trim()||undefined})},token);
     setNotice("Your service request was submitted. It is awaiting the provider's response.");
     setSelected(null);setMessage("");
     setRequests(current=>[created,...current]);
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't submit this service request.");}
   finally{setSubmitting(false);}
 }

 return <div className="grid">
   <div><div className="eyebrow">Professional services</div><h1 className="h1">Find help, then deliver it well.</h1><p className="muted">Browse published service offers. Requests require an active membership and are governed by provider acceptance and explicit status transitions.</p></div>
   <Card id="service-discovery">
     <form onSubmit={e=>{e.preventDefault();void load(query)}} className="row" style={{gap:10,flexWrap:"wrap"}}>
       <label style={{flex:"1 1 240px"}}>Search services<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Category, capability or keyword" style={{width:"100%"}}/></label>
       <button className="btn btn-primary" type="submit" disabled={loading}>{loading?"Searching…":"Search"}</button>
       <button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>{setQuery("");void load("")}}>Clear</button>
     </form>
   </Card>
   {error&&<div className="form-error" role="alert">{error}<button className="btn btn-ghost" type="button" onClick={()=>{void load(query);void loadRequests()}}>Retry</button></div>}
   {notice&&<p className="muted" role="status">{notice}{!token&&<a href="/login?next=/services"> Sign in</a>}</p>}
   {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading published services…</p></div></Card>:items.length===0&&!error?<Card><h2 className="h2">No published services found</h2><p className="muted">Try another keyword or check again later. Only live published listings are shown.</p></Card>:<div className="grid grid-2">{items.map(service=><Card key={service.id}>
     <div className="row"><Badge>{service.service_category}</Badge><span className="tagline">{(service.delivery_mode||"remote").replaceAll("_"," ")}</span></div>
     <h2 className="h2" style={{marginTop:12}}>{service.title}</h2>
     <p className="muted">{service.description}</p>
     <div className="tagline">Provider: {service.display_name||service.provider_name||"Verified member"}</div>
     {service.location_label&&<div className="tagline" style={{marginTop:6}}>Location: {service.location_label}</div>}
     <div className="tagline" style={{marginTop:6}}>Pricing: {service.pricing_model==="quote"?"Request a quote":service.pricing_model==="free"?"Free":service.price_amount!=null?`${service.currency||""} ${Number(service.price_amount).toLocaleString()} · ${service.pricing_model}`:service.pricing_model}</div>
     <button className="btn btn-primary" type="button" style={{marginTop:16,width:"100%"}} onClick={()=>{setSelected(service);setMessage("");setNotice("");}}>Request this service</button>
   </Card>)}</div>}
   {selected&&<Card id="service-request"><div className="row"><div><div className="eyebrow">New service request</div><h2 className="h2">{selected.title}</h2></div><button className="btn btn-ghost" type="button" onClick={()=>setSelected(null)}>Close</button></div>
     {!token?<><p className="muted">Sign in with an active membership to request this service. A provider must accept before work begins.</p><a className="btn btn-primary" href="/login?next=/services">Sign in to continue</a></>:<form className="form-stack" onSubmit={submitRequest}><label>Message to the provider<textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Describe the help you need, intended outcome and any important context."/></label><p className="muted">Submitting creates a request in the “requested” state. No payment or service completion is implied.</p><button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?"Submitting…":"Submit service request"} <Handshake size={16}/></button></form>}
   </Card>}
   <Card><div className="row"><div><div className="h2">Your service requests</div><p className="muted">Requests and outcomes are visible to their permitted participants.</p></div><MessageSquareText color="var(--primary)"/></div>
     {!token?<p className="muted">Sign in to view requests you made or services you provide.</p>:requests.length===0?<p className="muted">No service requests are recorded for this account yet.</p>:<div className="grid">{requests.map(r=><div className="case-row" key={r.id}><div className="row"><b>{r.service_title||"Service request"}</b><Badge>{r.status.replaceAll("_"," ")}</Badge></div><small className="muted">{r.created_at?new Date(r.created_at).toLocaleString():"Request recorded"}</small>{r.message&&<p className="muted">{r.message}</p>}</div>)}</div>}
   </Card>
   <Card><Star color="var(--gold)"/><div className="h2" style={{marginTop:10}}>Outcome and feedback</div><p className="muted">A request moves through explicit provider and requester actions. Completion feedback does not automatically create a professional verification claim.</p></Card>
 </div>;
}

"use client";
import {useEffect} from "react";
import Link from "next/link";
import {AlertTriangle,RefreshCw,Home} from "lucide-react";
import {Card} from "../components/ui";

export default function ErrorPage({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{console.error("Portal route failed",error.digest||error.name||"client exception")},[error]);
  return <div className="auth-page"><Card>
    <div className="eyebrow"><AlertTriangle size={15}/> Something went wrong</div>
    <h1 className="h1">This page could not be loaded.</h1>
    <p className="muted">Your information has not been changed by this page error. Try loading the page again. If the problem continues, contact support and mention that a portal page failed to load.</p>
    <div className="landing-actions">
      <button className="btn btn-primary" onClick={()=>reset()}><RefreshCw size={16}/> Try again</button>
      <Link className="btn btn-ghost" href="/"><Home size={16}/> Return home</Link>
    </div>
  </Card></div>;
}

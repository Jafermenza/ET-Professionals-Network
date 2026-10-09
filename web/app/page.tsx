"use client";
import {ArrowRight,BriefcaseBusiness,ChartNoAxesCombined,HeartHandshake,ShieldCheck,UsersRound,CheckCircle2} from "lucide-react";
import {Card,Badge} from "../components/ui";
import styles from "./landing-hero.module.css";

const values=[
  {title:"Trusted professional identity",text:"Build one professional record for membership, capability, experience and contribution.",icon:ShieldCheck},
  {title:"Verified opportunities",text:"Discover jobs, services and mentorship with clear eligibility and privacy boundaries.",icon:BriefcaseBusiness},
  {title:"Meaningful relationships",text:"Connect professionals, mentors, employers and partners around useful work.",icon:HeartHandshake},
  {title:"Visible progress",text:"Track membership, organization and opportunity applications from submission to decision.",icon:ChartNoAxesCombined}
];

function ArchArtwork(){
 return <div className={styles.archBackdrop} aria-hidden="true">
  <svg viewBox="0 0 760 620" role="presentation" focusable="false">
   <defs>
    <linearGradient id="mpaArchGradient" x1="0" y1="1" x2="0.8" y2="0">
     <stop offset="0%" stopColor="var(--primary)"/>
     <stop offset="68%" stopColor="var(--primary)"/>
     <stop offset="100%" stopColor="var(--gold)"/>
    </linearGradient>
    <pattern id="mpaDotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
     <circle cx="2" cy="2" r="1.2" fill="var(--primary)" opacity=".18"/>
    </pattern>
   </defs>
   <rect width="760" height="620" fill="url(#mpaDotGrid)"/>
   <path className={styles.archLine} d="M135 620V300C135 153 265 65 380 40C495 65 625 153 625 300V620" stroke="url(#mpaArchGradient)" strokeWidth="2.5" fill="none"/>
   <path d="M185 620V314C185 205 283 124 380 101C477 124 575 205 575 314V620" stroke="var(--primary)" strokeWidth="1" opacity=".22" fill="none"/>
   <g stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="4 6" opacity=".8" fill="none">
    <path d="M380 40V8M135 300H42M625 300H718"/>
    <path d="M185 314H112V376M575 314H648V376"/>
   </g>
   <g fill="var(--gold)">
    <circle className={styles.nodePulse} cx="380" cy="40" r="4"/>
    <circle className={styles.nodePulseAlt} cx="135" cy="300" r="3.5"/>
    <circle className={styles.nodePulseAlt} cx="625" cy="300" r="3.5"/>
    <circle cx="112" cy="376" r="3"/><circle cx="648" cy="376" r="3"/>
   </g>
  </svg>
 </div>
}

export default function Home(){
 return <div className="landing grid" style={{gap:34}}>
  <section className={`landing-hero ${styles.hero}`}>
   <ArchArtwork/>
   <div className={`hero-copy ${styles.heroCopy}`}>
    <div className="eyebrow">Ethiopian Muslim Professionals Association · Ihsan / excellence</div>
    <h1 className={`h1 ${styles.heroTitle}`}>Connect trusted talent with <span className={`hero-accent ${styles.heroAccent}`}>meaningful opportunity.</span></h1>
    <p className={`hero-lead ${styles.heroLead}`}>One accountable professional ecosystem for membership, evidence-based verification, jobs, mentorship, services and collaboration — built to help people and organizations move from introduction to impact.</p>
    <div className={`landing-actions ${styles.heroActions}`}>
      <a className="btn btn-primary btn-lg" href="/apply">Apply / Join MPA <ArrowRight size={17}/></a>
      <a className="btn btn-ghost btn-lg" href="/jobs">Explore opportunities</a>
      <a className="btn btn-ghost btn-lg" href="/login">Login</a>
    </div>
    <div className={`landing-trust ${styles.trustRow}`}><span><ShieldCheck size={16}/> Adl · Justice</span><span><ShieldCheck size={16}/> Amanah · Trust</span><span><ShieldCheck size={16}/> Tabayyun · Due diligence</span><span><ShieldCheck size={16}/> Satr · Confidentiality</span></div>
    <div className={styles.capabilityRow} aria-label="Platform capabilities">
      <span><CheckCircle2 size={15}/> Verified professional profiles</span>
      <span><CheckCircle2 size={15}/> Jobs & recruitment</span>
      <span><CheckCircle2 size={15}/> Mentorship & services</span>
      <span><CheckCircle2 size={15}/> Application tracking</span>
    </div>
   </div>
   <Card>
    <div className="eyebrow">One ecosystem, many journeys</div>
    <h2 className="h2">Start where your work begins.</h2>
    <p className={`muted ${styles.journeyIntro}`}>Clear entry points for members, organizations and anyone making a first inquiry.</p>
    <div className="journey-list">
      <a href="/apply"><b>Professional / Member</b><span>Apply, build your profile, verify capability and find opportunities.</span><ArrowRight size={16}/></a>
      <a href="/organizations"><b>Organization / Partner</b><span>Register, complete verification, recruit and collaborate.</span><ArrowRight size={16}/></a>
      <a href="/apply/job"><b>Job seeker</b><span>Start with a short inquiry before completing the detailed application.</span><ArrowRight size={16}/></a>
      <a href="/apply/mentorship"><b>Mentorship seeker</b><span>Share a goal and contact details to begin the matching journey.</span><ArrowRight size={16}/></a>
      <a href="/track"><b>Existing applicant</b><span>Check status, recent updates and the next required action.</span><ArrowRight size={16}/></a>
    </div>
   </Card>
  </section>

  <section>
   <div className="section-heading"><div><div className="eyebrow">Real value, not just a directory</div><h2 className="h2">What the platform helps you do</h2></div><UsersRound color="var(--primary)"/></div>
   <div className="grid grid-4">{values.map(({title,text,icon:Icon})=><Card key={title}><Icon size={22} color="var(--primary)"/><h3>{title}</h3><p className="muted">{text}</p></Card>)}</div>
  </section>

  <section className="landing-split">
   <Card><Badge>For members</Badge><h2 className="h2">From membership to professional value</h2><p className="muted">Maintain your identity and membership, present verified capability without exposing private evidence, find relevant work, request mentorship, offer services and build a record of contribution.</p><div className="mini-flow"><span>Join</span><i>→</i><span>Build</span><i>→</i><span>Verify</span><i>→</i><span>Participate</span><i>→</i><span>Grow</span></div><a className="btn btn-primary" href="/apply">Start member application</a></Card>
   <Card><Badge>For organizations & partners</Badge><h2 className="h2">From registration to measurable outcomes</h2><p className="muted">Register your organization, complete verification, recruit eligible professionals, publish opportunities, request expertise and inspect progress across your work on the platform.</p><div className="mini-flow"><span>Register</span><i>→</i><span>Verify</span><i>→</i><span>Engage</span><i>→</i><span>Deliver</span><i>→</i><span>Measure</span></div><a className="btn btn-primary" href="/organizations">Register organization</a></Card>
  </section>

  <section className="landing-split">
   <Card><Badge>Public jobs</Badge><h2 className="h2">Interested in a job? Start without the long form.</h2><p className="muted">Choose a public vacancy, tell us your intent and contact information, then continue to detailed information when you are ready.</p><div className="landing-actions"><a className="btn btn-primary" href="/jobs">Browse jobs</a><a className="btn btn-ghost" href="/apply/job">Start job inquiry</a></div></Card>
   <Card><Badge>Public mentorship</Badge><h2 className="h2">Start with a goal, not a profile.</h2><p className="muted">Tell us what you want to learn and how to reach you. A reviewer can explain the matching path and, where authorized, consider a non-member request.</p><div className="landing-actions"><a className="btn btn-primary" href="/mentorship">Explore mentors</a><a className="btn btn-ghost" href="/apply/mentorship">Request mentorship</a></div></Card>
  </section>

  <section className="landing-track">
   <div><div className="eyebrow">No black box</div><h2 className="h2">Always know what happens next.</h2><p className="muted">After you sign in, the tracker brings membership, organization and job applications together with status, last update and the next action. Governance decisions remain auditable rather than hidden.</p></div>
   <div className="track-preview"><div><span className="timeline-dot"/><div><b>Submitted</b><small>Application received</small></div></div><div><span className="timeline-dot"/><div><b>Under review</b><small>Reviewer is checking your submission</small></div></div><div><span className="timeline-dot"/><div><b>Next action</b><small>We tell you if correction or payment is required</small></div></div><a className="btn btn-ghost" href="/track">Track an application <ArrowRight size={16}/></a></div>
  </section>

  <section className="landing-final">
    <div><div className="eyebrow">Begin with confidence</div><h2 className="h2">Your next useful action is one click away.</h2><p className="muted">Apply if you are new, register if you need an account, login if you already belong, or track a submitted application.</p></div>
    <div className="landing-actions"><a className="btn btn-primary" href="/apply">Apply / Register</a><a className="btn btn-ghost" href="/login">Login</a><a className="btn btn-ghost" href="/track">Track progress</a></div>
  </section>
 </div>
}

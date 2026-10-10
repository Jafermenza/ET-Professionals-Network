"use client";
import {ArrowRight,BriefcaseBusiness,ChartNoAxesCombined,HeartHandshake,ShieldCheck,UsersRound,CheckCircle2,ClipboardCheck,LockKeyhole,Network} from "lucide-react";
import {Card,Badge} from "../components/ui";
import styles from "./landing-hero.module.css";

const values=[
  {title:"Trusted professional identity",text:"Build one professional record for membership, capability, experience and contribution.",icon:ShieldCheck},
  {title:"Verified opportunities",text:"Discover jobs, services and mentorship with clear eligibility and privacy boundaries.",icon:BriefcaseBusiness},
  {title:"Meaningful relationships",text:"Connect professionals, mentors, employers and partners around useful work.",icon:HeartHandshake},
  {title:"Visible progress",text:"Track membership, organization and opportunity applications from submission to decision.",icon:ChartNoAxesCombined}
];

function MpaMark(){return <svg className={styles.mpaMark} viewBox="0 0 100 100" aria-hidden="true"><path d="M16 88V51C16 30 35 14 50 8V88H34V54C34 42 41 33 50 28" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinejoin="round"/><path d="M50 8C68 15 84 29 84 49C84 66 73 74 58 74H50V57H59C68 57 69 48 63 41C59 36 54 33 50 31" fill="none" stroke="var(--gold)" strokeWidth="8" strokeLinejoin="round"/><path d="M34 88H74" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"/></svg>}

function ArchArtwork(){return <div className={styles.archBackdrop} aria-hidden="true}><svg viewBox="0 0 500 520" role="presentation" focusable="false"><defs><linearGradient id="mpaArchGradient" x1="0" y1="1" x2=".8" y2="0"><stop offset="0%" stopColor="var(--primary)"/><stop offset="100%" stopColor="var(--gold)"/></linearGradient><pattern id="mpaDotGrid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="var(--primary)" opacity=".16"/></pattern></defs><rect width="500" height="520" fill="url(#mpaDotGrid)"/><path className={styles.archLine} d="M70 520V250C70 125 165 47 250 25C335 47 430 125 430 250V520" stroke="url(#mpaArchGradient)" strokeWidth="2.5" fill="none"/><path d="M112 520V260C112 170 180 98 250 79C320 98 388 170 388 260V520" stroke="var(--primary)" strokeWidth="1" opacity=".2" fill="none"/><g stroke="var(--gold)" strokeWidth="1.5" strokeDasharray="4 6" fill="none" opacity=".7"><path d="M250 25V0M70 250H16M430 250H484M112 260H58V320M388 260H442V320"/></g><g fill="var(--gold)"><circle className={styles.nodePulse} cx="250" cy="25" r="4"/><circle className={styles.nodePulseAlt} cx="70" cy="250" r="3.5"/><circle className={styles.nodePulseAlt} cx="430" cy="250" r="3.5"/></g></svg></div>}

export default function Home(){return <div className="landing grid" style={{gap:34}}>
 <section className={`landing-hero ${styles.hero}`}>
  <div className={styles.heroCopy}>
   <div className={styles.brandEyebrow}><span className={styles.brandMarkSmall}><MpaMark/></span><span>ETHIOPIAN MUSLIM PROFESSIONALS ASSOCIATION <i/> IHSAN · EXCELLENCE</span></div>
   <h1 className={`h1 ${styles.heroTitle}`}>Connect trusted talent with <span className={`hero-accent ${styles.heroAccent}`}>meaningful opportunity.</span></h1>
   <p className={`hero-lead ${styles.heroLead}`}>One accountable professional ecosystem for membership, verification, jobs, mentorship and services — helping people and organizations turn connections into meaningful work.</p>
   <div className={`landing-actions ${styles.heroActions}`}><a className="btn btn-primary btn-lg" href="/apply">Apply / Join MPA <ArrowRight size={17}/></a><a className="btn btn-ghost btn-lg" href="/jobs">Explore opportunities</a><a className={styles.loginLink} href="/login">Login <ArrowRight size={15}/></a></div>
   <div className={styles.trustBar} aria-label="Platform principles"><span><CheckCircle2 size={17}/> Evidence-based verification</span><span><Network size={17}/> Professional connections</span><span><LockKeyhole size={17}/> Privacy-aware applications</span></div>
  </div>
  <div className={styles.heroVisual}>
   <ArchArtwork/>
   <div className={styles.visualLogo}><MpaMark/><div><strong>One trusted network.</strong><span>Professional identity to opportunity</span></div></div>
   <Card>
    <div className={styles.previewTop}><div><div className="eyebrow">THE MPA PLATFORM</div><h2 className={styles.previewTitle}>Your next step, made clear.</h2></div><span className={styles.previewIcon}><ClipboardCheck size={20}/></span></div>
    <div className={styles.previewRows}><div><span className={styles.previewRowIcon}><UsersRound size={17}/></span><div><b>Membership & identity</b><small>Build your professional record</small></div><ArrowRight size={15}/></div><div><span className={styles.previewRowIcon}><ShieldCheck size={17}/></span><div><b>Verification & trust</b><small>Evidence-led professional claims</small></div><ArrowRight size={15}/></div><div><span className={styles.previewRowIcon}><BriefcaseBusiness size={17}/></span><div><b>Jobs & mentorship</b><small>Find relevant next steps</small></div><ArrowRight size={15}/></div></div>
    <a className={styles.previewFooter} href="/track"><span><span className={styles.statusDot}/> Application tracking</span><span>View status <ArrowRight size={14}/></span></a>
   </Card>
  </div>
 </section>

 <section className={styles.journeys}>
  <div className="section-heading"><div><div className="eyebrow">A clear place to start</div><h2 className="h2">How can we help you today?</h2></div></div>
  <div className="grid grid-4">
   <Card><UsersRound size={22} color="var(--primary)"/><h3>Join as a professional</h3><p className="muted">Apply for membership, build your profile and discover ways to contribute.</p><a className={styles.textLink} href="/apply">Start application <ArrowRight size={15}/></a></Card>
   <Card><BriefcaseBusiness size={22} color="var(--primary)"/><h3>Find a job</h3><p className="muted">Explore vacancies or begin with a short inquiry before the detailed application.</p><a className={styles.textLink} href="/jobs">Browse opportunities <ArrowRight size={15}/></a></Card>
   <Card><HeartHandshake size={22} color="var(--primary)"/><h3>Find mentorship</h3><p className="muted">Share your goals and begin a mentorship request, even before completing a profile.</p><a className={styles.textLink} href="/apply/mentorship">Request mentorship <ArrowRight size={15}/></a></Card>
   <Card><Network size={22} color="var(--primary)"/><h3>Register an organization</h3><p className="muted">Verify your organization, recruit talent and build professional partnerships.</p><a className={styles.textLink} href="/organizations">Get started <ArrowRight size={15}/></a></Card>
  </div>
 </section>

 <section>
  <div className="section-heading"><div><div className="eyebrow">Real value, not just a directory</div><h2 className="h2">What the platform helps you do</h2></div></div>
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

 <section className="landing-track"><div><div className="eyebrow">No black box</div><h2 className="h2">Always know what happens next.</h2><p className="muted">After you sign in, the tracker brings membership, organization and job applications together with status, last update and the next action. Governance decisions remain auditable rather than hidden.</p></div><div className="track-preview"><div><span className="timeline-dot"/><div><b>Submitted</b><small>Application received</small></div></div><div><span className="timeline-dot"/><div><b>Under review</b><small>Reviewer is checking your submission</small></div></div><div><span className="timeline-dot"/><div><b>Next action</b><small>We tell you if correction or payment is required</small></div></div><a className="btn btn-ghost" href="/track">Track an application <ArrowRight size={16}/></a></div></section>

 <section className="landing-final"><div><div className="eyebrow">Begin with confidence</div><h2 className="h2">Your next useful action is one click away.</h2><p className="muted">Apply if you are new, register if you need an account, login if you already belong, or track a submitted application.</p></div><div className="landing-actions"><a className="btn btn-primary" href="/apply">Apply / Register</a><a className="btn btn-ghost" href="/login">Login</a><a className="btn btn-ghost" href="/track">Track progress</a></div></section>
 </div>}

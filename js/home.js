/* De Mott OS · front page — merges every live area into one view.
   Helpers from js/util.js, capture parsing from js/capture.js.
   Nothing here is hardcoded: it all comes from data/areas.json and the feeds
   that file points at. */

/* An area feed is a list of dated items. School's events.json already has this
   shape; a new area needs no more than { date, title } per item.
       date    "2026-10-07"     ISO, required
       title   "Offering Memo"  required
       kind    due | class | admin | null
       note, weight, time:{start,end}, location   all optional
       label   "RDEV 200"       optional tag; school derives it from courses.json
   Anything else stays available to that area's own page. */
function adapt(area, raw, labels){
  return raw.map(e=>({
    id:e.id, date:e.date||null, title:e.title, kind:e.kind||"", note:e.note||"",
    weight:e.weight||"", weightNum:e.weightNum||0, time:e.time||null, location:e.location||"",
    repeat:e.repeat||null, status:e.status||"", hours:e.hours!=null?e.hours:null,
    project:e.project||"", added:e.added||null, course:e.course||null,
    label: e.label || (labels && e.course && labels[e.course] ? labels[e.course].code : area.name),
    area
  })).filter(e=>e.title);
}

const minsNow = () => { const d=new Date(); return d.getHours()*60+d.getMinutes(); };
const toMins  = hhmm => { const [h,m]=hhmm.split(":").map(Number); return h*60+m; };
const hhmmOf  = dec => String(Math.floor(dec)).padStart(2,"0")+":"+String(Math.round((dec%1)*60)).padStart(2,"0");
const gap     = mins => mins<60 ? mins+"m" : Math.floor(mins/60)+"h"+(mins%60?" "+(mins%60)+"m":"");

(async function(){
try{
  const cfg=await j("data/areas.json");
  Nav.render(cfg,"today");
  const state=await j("data/state.json").catch(()=>({done:{}}));
  const undo=await j("data/undo.json").catch(()=>[]);
  const done=state.done||{}, undoDepth=Array.isArray(undo)?undo.length:0;
  const areaIndex={}; cfg.areas.forEach(a=>areaIndex[a.id]={id:a.id,name:a.name});
  /* An area with "home": false keeps its tab, its list page and its card here,
     but none of its items reach this page — not Today, the horizon, Slipped,
     the load chart or In flight. Novin is set this way (2026-09-15): James
     asked for work items off the front page. Its reserved hours still come
     from data/week.json, so the capacity read and Colliding are unchanged. */
  const onHome=a=>a.home!==false;

  const feeds=await Promise.all(cfg.areas.map(async a=>{
    if(!a.live) return {area:a, items:[], board:null};
    const out={area:a, items:[], board:null};
    try{
      if(a.feed){
        const [raw,labels]=await Promise.all([j(a.feed), a.labels?j(a.labels):Promise.resolve(null)]);
        out.items=adapt(a,raw,labels);
      }
      if(a.board) out.board=await j(a.board);
    }catch(err){ out.error=err.message; }
    return out;
  }));

  /* A board item that carries a date belongs in the day view like anything
     else — James asked for that explicitly. It stays read-only: Notion owns it,
     so it can only be cleared over there, and the next pull removes it here. */
  feeds.forEach(f=>{
    if(!f.board || !f.board.items || !onHome(f.area)) return;
    const active=f.board.activeStatuses||[];
    f.board.items.filter(i=>i.due && active.includes(i.status)).forEach(i=>{
      f.items.push({
        id:null, date:i.due, title:i.title, kind:"due", note:i.status,
        weight:"", time:null, location:"", label:f.area.name, url:i.url,
        readonly:true, board:true, area:f.area
      });
    });
  });

  // Notes captured on the phone, waiting in iCloud. Quiet when there are none.
  if(window.PhoneCapture) PhoneCapture.ingest(cfg);

  const week=await j("data/week.json").catch(()=>null);

  /* ---------- what this page is allowed to show ----------
     Someday and archived items are out of the day view by definition: parking
     something is the opposite of scheduling it. They stay reachable on their
     area's list page and in the weekly review, which is where they get
     resurfaced on purpose rather than nagging from here. */
  /* His Google calendars, pulled down by sync_calendar.py. Not an area: no
     tab, no card, nothing to tick — a meeting is a fact about the day, not a
     piece of work — so they join the day view, the horizon and Colliding
     read-only, and stay out of the load chart, Slipped and the review. Rows
     arrive already expanded and already HTML-escaped (the sync does both). */
  const CAL={id:"calendar", name:"Calendar", accent:"--a-cal"};
  const calDoc=cfg.calendar?await j(cfg.calendar).catch(()=>null):null;
  const calItems=(calDoc?.items||[]).map(c=>({
    id:null, date:c.date, title:c.title, kind:"event", note:"", weight:"",
    time:c.time||null, location:c.location||"", label:c.calendar,
    readonly:true, calendar:true, area:CAL, key:"cal:"+c.uid
  }));

  /* What to wear, from his "New Smells" sheet (js/scent.js). Loaded up
     front so the weather callback below can repaint it whenever it lands. */
  const scentData=cfg.scent?await j(cfg.scent).catch(()=>null):null;

  const stored=feeds.filter(f=>onHome(f.area)).flatMap(f=>f.items);
  const parked=stored.filter(e=>e.status==="someday").length;

  /* A repeating item is one stored rule; the day view needs one row per
     occurrence. Expand across the widest window anything on this page asks
     for — today through the end of the load chart — and no further. */
  const WEEKS=10;
  const monday=addDays(TODAY,-((parseISO(TODAY).getDay()+6)%7));
  const chartEnd=addDays(monday,WEEKS*7-1);
  const every=expand(stored.filter(isActive), TODAY, chartEnd);
  every.forEach(e=>{ e.done=!!done[e.key]; });
  const all=every.concat(calItems).filter(e=>e.date).sort((x,y)=>
    x.date<y.date?-1:x.date>y.date?1:(x.time?.start||"").localeCompare(y.time?.start||""));
  const loose=every.filter(e=>!e.date);        // captured with no date yet

  const tickable = e => Rows.tickable(e);
  const styleOf  = a => `--area:var(${a.accent})`;

  /* ---------- header ---------- */
  const now=new Date();
  $("eyebrow").textContent=DAYS[now.getDay()].toUpperCase()+" · "+now.getDate()+" "+MONTHS[now.getMonth()]+" "+now.getFullYear();
  /* The edition follows the clock, the way a paper's does. Repainted with the
     right-now line, so a tab left open all day moves on by itself. */
  const editionOf=h=>h<5||h>=21?"Late edition":h<12?"Morning edition":h<17?"Afternoon edition":"Evening edition";
  const paintEdition=()=>{ $("edition").textContent=[cfg.edition,editionOf(new Date().getHours())].filter(Boolean).join(" · "); };
  paintEdition();
  $("pagetitle").textContent=cfg.title;
  $("pagesub").innerHTML=cfg.sub;
  document.title=cfg.title;

  const horizonEnd=addDays(TODAY,cfg.horizonDays);
  const soon=all.filter(e=>e.date>=TODAY && e.date<=horizonEnd);
  /* Recurring items never reach Slipped. A missed instance of "water the
     plants" is not a slipped deliverable, and a daily rule would bury the real
     ones under sixty rows — the same reasoning that keeps board items out. */
  const slipped=all.filter(e=>e.date<TODAY && !e.done && !e.occ && (e.kind==="due"||e.kind==="admin"));
  const nextDue=all.find(e=>e.date>=TODAY && e.kind==="due" && !e.done);
  const liveCount=feeds.filter(f=>f.area.live).length;
  const clip=(t,n)=>t.length>n?t.slice(0,n-1).trimEnd()+"…":t;

  $("statrow").innerHTML=[
    {n:soon.length, label:"in the next "+cfg.horizonDays+" days"},
    {n:soon.filter(e=>e.kind==="due").length, label:"of those are due dates"}
  ].map(s=>`<div class="stat"><b>${s.n}</b><span>${s.label}</span></div>`).join("")
   + (slipped.length?`<div class="stat slip"><b>${slipped.length}</b><span>carried over</span></div>`:"")
   + (nextDue?`<div class="stat flag" title="${nextDue.title}"><b>${relDay(nextDue.date)}</b><span>${nextDue.label} · ${clip(nextDue.title,42)}</span></div>`:"");

  /* ---------- what to wear ----------
     A day's context for js/scent.js: what is on it (private areas are
     filtered inside Scent.pick), whether it is a Novin office day by the
     weekly grid (skipping its holidays), whether a class meets, and the
     forecast once it lands. Painted now, and again when the weather arrives. */
  let wxNow=null;
  const scentCtx=ds=>{
    const wd=(parseISO(ds).getDay()+6)%7, hol=(week?.holidays||[]).includes(ds);
    return { items:all.filter(e=>e.date===ds),
      officeDay:!hol&&(week?.blocks||[]).some(b=>b.type==="novin"&&b.day===wd),
      classDay:all.some(e=>e.date===ds&&e.kind==="class"),
      forecast:wxNow?.days?.find(x=>x.date===ds)||null };
  };
  function paintScent(){
    if(!scentData||typeof Scent==="undefined") return;
    $("scentpanel").innerHTML=Scent.card(scentData,Scent.pick(scentData,scentCtx(TODAY)));
    $("s-scent").hidden=false;
  }
  paintScent();

  /* ---------- the ears ----------
     A paper's nameplate is flanked by two small boxes — the weather, the
     price. Here: the weather, and how far off the next big deadline sits.
     The issue number lives in the dateline, where a paper prints Vol. / No. "Big" is a grade weight of at least ears.bigWeight, so
     the countdown is the thing worth dreading, not the next reading response.
     Either ear simply stays hidden when it has nothing true to say. */
  if(cfg.ears){
    const ears=cfg.ears;
    const meta=ears.term?await j(ears.term).catch(()=>null):null;
    if(meta?.termStart && TODAY>=meta.termStart && (!meta.termEnd || TODAY<=meta.termEnd)){
      $("eyebrow").textContent+=` · No. ${daysBetween(meta.termStart,TODAY)+1}`;
      $("eyebrow").title=`Issue ${daysBetween(meta.termStart,TODAY)+1} of ${ears.termName||"the term"}`;
    }
    /* How much of the term is behind him: a printed ruler, one tick a week,
       inked up to today. Days, not weeks, drive the fill so it moves daily;
       the label counts in weeks because that is how a term is lived.
       Asked for 2026-09-29. Hidden outside the term, and in the late edition. */
    if(meta?.termStart && meta.termEnd && TODAY>=meta.termStart && TODAY<=meta.termEnd){
      const total=daysBetween(meta.termStart,meta.termEnd)+1, gone=daysBetween(meta.termStart,TODAY)+1;
      const weeks=Math.ceil(total/7), wk=Math.floor((gone-1)/7)+1, pct=Math.round(gone/total*100);
      const left=total-gone;
      $("termbar").innerHTML=`<span class="tlabel">${ears.termName?ears.termName.replace(/^the /,"").replace(/^./,c=>c.toUpperCase()):"The term"}</span>
        <span class="truler" style="--fill:${(gone/total*100).toFixed(1)}%;--weeks:${weeks}" title="${gone} of ${total} days · ends ${shortDate(meta.termEnd)}"><i></i></span>
        <span class="tcount"><b>Week ${wk} of ${weeks}</b> · ${pct}% through · ${left} day${left===1?"":"s"} left</span>`;
      $("termbar").hidden=false;
    }
    /* Not awaited: the page must not wait on someone else's server. The ear
       fills in when the answer lands, or never, and either is fine. */
    if(ears.weather && typeof Weather!=="undefined") Weather.get(ears.weather).then(w=>{
      wxNow=w; paintScent(); try{ paintLate(); }catch(_){}   // late edition may not exist yet
      const d=w?.days?.[0]; if(!w?.now || !d) return;
      $("earL").innerHTML=`<b>${w.now.temp}° <span class="wx">${Weather.words(w.now.code)}</span></b>`
        + `<i>${ears.weather.place} · high ${d.hi}°${d.rain>=20?` · ${d.rain}% rain`:""}</i>`;
      $("earL").title=`Today ${d.lo}–${d.hi}°F, ${d.rain}% chance of rain · Open-Meteo`;
      $("earL").hidden=false;
    });
    const big=all.find(e=>e.date>=TODAY && e.kind==="due" && !e.done && (e.weightNum||0)>=(ears.bigWeight||20));
    if(big){
      const n=daysUntil(big.date);
      $("earR").innerHTML=`<b>${n===0?"Today":n===1?"Tomorrow":n+" days"}</b><i>${n>1?"to ":""}${big.label} · ${clip(big.title,30)}</i>`;
      $("earR").title=`${big.title} — ${shortDate(big.date)}${big.weight?" · "+big.weight:""}`;
      $("earR").hidden=false;
    }
  }

  /* ---------- unclaimed time today, from the school week grid ---------- */
  const idx=(now.getDay()+6)%7;                        // week.days runs MON..SUN
  const openToday=(week?.open||[]).filter(o=>o.day===idx);
  const freeHrs=openToday.reduce((s,o)=>s+(o.end-o.start),0);

  /* ---------- a tick control shared by every list ---------- */
  /* Row chrome — ticking, the editor, capture — lives in js/rows.js so this
     page and the area list pages can't drift apart. */
  const tick = e => Rows.tick(e), editBtn = e => Rows.editBtn(e), own = e => Rows.own(e);

  const titleOf = e => e.url
    ? `<a class="ttl out" href="${e.url}" target="_blank" rel="noopener">${e.title}</a>`
    : `<span class="ttl">${e.title}</span>`;

  /* Repeat, project and a set duration are properties of the row rather than
     of the day it landed on. Shown inline because otherwise "every Monday"
     is indistinguishable from a one-off that happens to be on a Monday. */
  const chips = e =>
      (e.repeat?`<span class="chip rep">↻ ${repeatLabel(e.repeat)}</span>`:"")
    + (e.project?`<span class="chip proj">/${e.project}</span>`:"")
    + (e.hours?`<span class="chip hrs">${fmtHours(e.hours)}</span>`:"");
  const rowFor = e => `<div class="row ${e.kind}${e.done?" isdone":""}${e.board?" fromboard":""}" style="${styleOf(e.area)}" data-row="${e.id||""}">
      <span class="tickcell">${tickable(e)?tick(e):""}</span>
      <span class="tag">${e.label}</span>
      <span>${titleOf(e)}${chips(e)}${e.note?`<span class="nt">${e.note}</span>`:""}${e.location?`<span class="nt">${e.location}</span>`:""}</span>
      <span class="when">${e.time?`${e.time.start}–${e.time.end||e.time.start}`:e.kind==="due"?"due":"all day"}${e.weight?" · "+e.weight:""}${editBtn(e)}</span>
    </div>`;

  /* ---------- today, with a live right-now line ---------- */
  const todays=all.filter(e=>e.date===TODAY);
  const nextUp=all.find(e=>e.date>TODAY);

  function rightNow(){
    const timed=todays.filter(e=>e.time).map(e=>({...e,s:toMins(e.time.start),e2:e.time.end?toMins(e.time.end):toMins(e.time.start)+60}));
    const m=minsNow();
    const on=timed.find(t=>m>=t.s && m<t.e2);
    if(on) return `<b>now</b> ${on.label} · ${on.title} <i>until ${on.time.end||"?"}</i>`;
    const next=timed.filter(t=>t.s>m).sort((a,b)=>a.s-b.s)[0];
    if(next) return `<b>next</b> ${next.label} · ${next.title} <i>in ${gap(next.s-m)}, at ${next.time.start}</i>`;
    if(timed.length) return `<b>done for the day</b> <i>nothing else scheduled</i>`;
    return `<b>nothing scheduled today</b>${freeHrs?` <i>${freeHrs} hrs unclaimed</i>`:""}`;
  }

  /* An empty day gets a headline, not an empty box — it is the one bit of
     news that is genuinely good. The words are fixed; which ones print is
     decided by what is true (anything slipped? any open time?), so it never
     congratulates a day that has a slipped deadline sitting under it. */
  function stopPress(){
    const head=slipped.length
      ? `A quiet day, and ${slipped.length} carried over.`
      : "All quiet on the day desk.";
    const stand=[
      slipped.length?"A good day to give those a new date.":"Nothing due, nothing carried over.",
      freeHrs?`${freeHrs} hrs unclaimed.`:"",
      nextUp?`Next up: <b>${nextUp.title}</b> — ${nextUp.label}, ${relDay(nextUp.date)}.`:""
    ].filter(Boolean).join(" ");
    return `<div class="stoppress"><div class="eyebrow">Stop press</div>
      <h3>${head}</h3><p>${stand}</p></div>`;
  }

  function paintToday(){
    const openTxt=openToday.length
      ? openToday.map(o=>hhmmOf(o.start)+"–"+hhmmOf(o.end)).join(", ")+` · ${freeHrs} hrs unclaimed`
      : "";
    $("todaypanel").innerHTML=`<div class="today-head">
        <div class="dnum">${now.getDate()}</div>
        <div class="dwords">${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}</div>
        <div class="count">${todays.length?todays.length+" item"+(todays.length>1?"s":""):"clear"}</div>
      </div>
      <div class="rightnow" id="rightnow">${rightNow()}</div>`
      + (todays.length
          ? `<div class="today-list">${todays.map(rowFor).join("")}</div>`
          : stopPress())
      + (openTxt?`<div class="today-foot">Open windows today: <b>${openTxt}</b></div>`:"");
  }
  paintToday();

  /* ---------- the late edition: a shutdown, not a scroll ----------
     From 21:00 until 05:00 the page stops being a list of everything and
     becomes one short note: what tomorrow starts with, and the reassurance
     that the rest is written down. Two findings behind it: writing tomorrow's
     to-dos before bed gets people to sleep faster (Scullin et al., 2018), and
     unfinished tasks stop intruding once they have a plan attached
     (Masicampo & Baumeister, 2011) — the same idea as Newport's shutdown
     ritual. The pile, the counts and the countdown ear are exactly what keeps
     a mind running at eleven at night, so they wait for the morning edition.

     "Show the full paper" is always one click, and only for tonight: the
     choice is keyed to the date in sessionStorage (wrapped — private windows
     throw), so tomorrow night the late edition is back by default.
     James asked for this on 2026-09-29. */
  const lateKey="dmos:fullpaper:"+TODAY;
  const isLate=()=>{ const h=new Date().getHours(); return h>=21||h<5; };
  const wantsFull=()=>{ try{ return sessionStorage.getItem(lateKey)==="1"; }catch(_){ return false; } };
  function paintLate(){
    const on=isLate()&&!wantsFull();
    document.body.classList.toggle("late",on);
    $("s-late").hidden=!on;
    if(!on) return;
    const afterMidnight=new Date().getHours()<5;
    const day=afterMidnight?TODAY:addDays(TODAY,1);
    const word=afterMidnight?"Today":"Tomorrow";
    const next=all.filter(e=>e.date===day&&!e.done);
    const timed=next.filter(e=>e.time&&e.time.start).sort((a,b)=>a.time.start.localeCompare(b.time.start));
    const due=next.filter(e=>e.kind==="due"||e.kind==="admin");
    const first=timed[0]||due[0]||next[0];
    const head=!first ? `${word} is clear.`
      : first.time ? `${word} starts with ${first.title}, at ${first.time.start}.`
      : `${word} starts with ${first.title}.`;
    const others=next.length-(first?1:0);
    const open=afterMidnight?[]:todays.filter(e=>!e.done&&tickable(e)&&e.kind!=="event");
    const lines=[
      first?`${first.label}${first.location?" · "+first.location:""}.`:"",
      others>0?`${others} other thing${others===1?" is":"s are"} written down for ${word.toLowerCase()}, and everything after that is too.`
              :"Everything after that is written down.",
      open.length?`${open.length===1?"One thing":open.length+" things"} from today ${open.length===1?"is":"are"} still open. `
        +`${open.length===1?"It":"They"}'ll be carried over, and that's fine.`:"",
      "Nothing on the list needs you tonight."
    ].filter(Boolean);
    /* Laying tomorrow's scent out tonight is one decision fewer in the
       morning — the same move as the rest of the note. */
    const lay=scentData&&typeof Scent!=="undefined"?Scent.pick(scentData,scentCtx(day)).day:null;
    $("s-late").innerHTML=`<div class="latenote">
        <div class="eyebrow">Late edition</div>
        <h2>${head}</h2>
        <p>${lines.join(" ")}</p>
        ${lay?`<p class="latelay">Lay out <b>${lay.row.scent}</b> — ${lay.row.mood}, ${lay.reason}.</p>`:""}
        <button type="button" class="mini" id="fullpaper">show the full paper</button>
      </div>`;
    $("fullpaper").onclick=()=>{ try{ sessionStorage.setItem(lateKey,"1"); }catch(_){}
      document.body.classList.remove("late"); $("s-late").hidden=true; };
  }
  paintLate();
  setInterval(()=>{ const el=$("rightnow"); if(el) el.innerHTML=rightNow(); paintEdition(); paintLate(); },30000);

  /* ---------- is anything quietly broken? ----------
     Every background piece here can fail silently: a Notion pull that 404s for
     six days, a backup nobody ran, notes stuck in iCloud. One line, and it goes
     accent when something has actually gone stale — so the answer to "can I trust
     what I'm looking at" is on the page rather than in a log. */
  /* Where this page's data came from, first on the line. When the Mac answered
     this says nothing — "live" is the normal case and does not need announcing.
     When it didn't, this is the most important fact on the page: everything
     below is a snapshot, and how old it is decides whether to trust it. Same
     rule as the Novin board's syncedAt, which exists because a sync sat broken
     for six days with nothing anywhere saying so.

     Two async writers share this one line, so neither may assume it ran
     first: each sets its own half and repaints the whole thing. */
  let lead = "", bits = "";
  const paintStrip = () => { const h=$("statusstrip"); if(h) h.innerHTML = lead + bits; };
  freshness().then(f=>{
    const bit=[];
    if(!f.live) bit.push(`<span class="stbit${f.bad?" warn":""}">${f.text}</span>`);
    /* Queued writes belong on this line for the same reason every other
       background job does: the failure that matters is the silent one. Unsent
       is the accent case — those are captures still sitting on this device. */
    const n=Outbox.waiting(), un=Outbox.unsent();
    if(n) bit.push(`<span class="stbit${un?" warn":""}">`
      + `${n} waiting for your Mac${un?` · ${un} not uploaded yet`:""}</span>`);
    lead = bit.join("");
    paintStrip();
  });

  post("/api/status",{}).then(st=>{
    const ago=iso=>{ if(!iso) return null; const d=daysBetween(iso.slice(0,10),TODAY);
      return d<=0?"today":d===1?"yesterday":`${d}d ago`; };
    const parts=[];
    if(st.hasRemote) parts.push(st.unpushed
      ? {t:`${st.unpushed} change${st.unpushed===1?"":"s"} not backed up`, warn:true}
      : {t:`backed up ${ago(st.lastPush)}`});
    const nDays=st.notionSynced?daysBetween(st.notionSynced.slice(0,10),TODAY):null;
    if(st.notionSynced) parts.push({t:`Novin board ${ago(st.notionSynced)}`, warn:nDays>3});
    const cDays=st.canvasChecked?daysBetween(st.canvasChecked.slice(0,10),TODAY):null;
    parts.push({t:`bCourses checked ${ago(st.canvasChecked)||"never"}`, warn:cDays===null||cDays>7});
    // Reads the WhatsApp store in the background, so it belongs on this line:
    // the digest going quietly stale is the exact failure mode the Notion pull
    // demonstrated for six days with nothing anywhere saying so.
    const wDays=st.whatsappDigested?daysBetween(st.whatsappDigested.slice(0,10),TODAY):null;
    if(st.whatsappDigested!==undefined)
      parts.push({t:`WhatsApp read ${ago(st.whatsappDigested)||"never"}`, warn:wDays===null||wDays>2});
    // His Google calendars. Only once a link exists — a warning about a sync
    // he never set up is nagging, not news. Stale after a day: a meeting that
    // moved this morning is exactly what this line is for.
    if(st.calendarLinked){
      const gDays=st.calendarSynced?daysBetween(st.calendarSynced.slice(0,10),TODAY):null;
      parts.push({t:`calendar read ${ago(st.calendarSynced)||"never"}`, warn:gDays===null||gDays>1});
    }
    if(st.phoneWaiting) parts.push({t:`${st.phoneWaiting} phone note${st.phoneWaiting===1?"":"s"} waiting`, warn:true});
    // The phone's outbox. A queue that quietly stopped draining looks exactly
    // like a phone that never captured anything, so the age goes on the line.
    // Nothing here until the outbox has actually worked once: a line saying a
    // queue is broken, on a Mac whose owner has not set a phone up yet, is the
    // nagging that makes a status line something you learn to scroll past.
    const oDays=st.outboxDrained?daysBetween(st.outboxDrained.slice(0,10),TODAY):null;
    if(st.outboxWaiting)
      parts.push({t:`${st.outboxWaiting} from your phone waiting`, warn:true});
    else if(st.outboxDrained && st.outboxTried > st.outboxDrained
            && daysBetween(st.outboxDrained.slice(0,10), st.outboxTried.slice(0,10)) >= 1)
      parts.push({t:`phone outbox can't reach GitHub`, warn:true});
    else if(st.outboxDrained)
      parts.push({t:`phone outbox ${ago(st.outboxDrained)}`, warn:oDays===null||oDays>3});
    if(!st.iCloudReadable) parts.push({t:`iCloud needs “Phone Notes.command”`, warn:false});
    if(!st.brainDumpReady) parts.push({t:`brain dump has no API key`, warn:true});
    bits = parts.map(b=>
      `<span class="stbit${b.warn?" warn":""}">${b.t}</span>`).join("");
    paintStrip();
  }).catch(()=>{});

  /* ---------- prep for the next class day ----------
     What tomorrow's classes need done tonight: the readings from each class's
     prep block, plus anything due that day. It looks at tomorrow first, and if
     tomorrow has no class and nothing due it walks forward up to four days, so
     Friday shows Monday rather than an empty weekend.

     The readings come from the area's `prep` file (data/school/prep.json).
     Each prep entry carries `forClass`, the id of the session it prepares for,
     so nothing here matches on titles. Same-day refresher blocks (`sameDay`)
     are skipped: their note only points back at the main block. */
  const prepArea=cfg.areas.find(a=>a.live && a.prep && onHome(a));
  if(prepArea){
    const prepRows=await j(prepArea.prep).catch(()=>[]);
    const readingsFor=id=>prepRows.filter(p=>p.forClass===id && !p.sameDay)
      .map(p=>String(p.note||"").replace(/\\,/g,",").split(/\n\s*\n/)[0].replace(/\n/g," · ").trim())
      .filter(Boolean);
    let day=null, sessions=[], dues=[];
    for(let d=1; d<=4 && !day; d++){
      const cand=addDays(TODAY,d);
      sessions=all.filter(e=>e.date===cand && e.area.id===prepArea.id && e.course && e.time);
      // Deadlines: anything marked due, plus school's own admin dates (add/drop).
      dues=all.filter(e=>e.date===cand && (e.kind==="due" || (e.kind==="admin" && e.area.id===prepArea.id)));
      if(sessions.length||dues.length) day=cand;
    }
    if(day){
      const dd=parseISO(day);
      const name=daysBetween(TODAY,day)===1?"tomorrow":DAYS[dd.getDay()];
      const prepped=sessions.filter(e=>done[`prep:${e.id}`]).length;
      const counts=[sessions.length&&`${prepped} of ${sessions.length} prepped`,
                    dues.length&&`${dues.length} due`].filter(Boolean).join(" · ");
      /* Each class is a checkbox: prep is work you do, and a list of readings
         you cannot tick is a list you stop reading. The key is prefixed so it
         can never collide with an item id — `done.js` skips these rather than
         counting them as ticks whose item vanished. */
      const prepKey=e=>`prep:${e.id}`;
      const session=e=>{
        const reads=readingsFor(e.id);
        const k=prepKey(e), isDone=!!done[k];
        return `<div class="row prow${isDone?" isdone":""}" style="${styleOf(e.area)}">
          <span class="tickcell">${Rows.tick({key:k, done:isDone})}</span>
          <span class="tag">${e.label}</span>
          <span><span class="ttl">${e.title}</span>
            ${reads.length?reads.map(r=>`<span class="pread">${r}</span>`).join("")
              :`<span class="nt">No prep block for this one.</span>`}
            ${e.note&&!reads.some(r=>r.includes(e.note))?`<span class="nt">${e.note}</span>`:""}</span>
          <span class="when">${e.time.start}${e.location?` · ${e.location}`:""}</span>
        </div>`;
      };
      const due=e=>{
        const reads=readingsFor(e.id);
        return reads.length ? rowFor({...e, note:[e.note].concat(reads).filter(Boolean).join(" · ")}) : rowFor(e);
      };
      /* The header count has to move when a box is ticked, or it contradicts
         the boxes underneath it until the next reload. */
      const repaintPrepCount=()=>{
        const boxes=[...document.querySelectorAll('#preppanel .tick[data-key^="prep:"]')];
        const on=boxes.filter(b=>b.getAttribute("aria-pressed")==="true").length;
        const el=document.querySelector("#preppanel .count");
        if(el && boxes.length) el.textContent=[`${on} of ${boxes.length} prepped`,
          dues.length&&`${dues.length} due`].filter(Boolean).join(" · ");
      };
      document.addEventListener("click", ev=>{
        if(ev.target.closest('#preppanel .tick')) setTimeout(repaintPrepCount, 0);
      });

      $("preppanel").hidden=false;
      $("preppanel").innerHTML=`<div class="today-head">
          <div class="dwords"><b>Prep for ${name}</b> · ${DAYS[dd.getDay()]}, ${MONTHS[dd.getMonth()]} ${dd.getDate()}</div>
          <div class="count">${counts}</div>
        </div>
        <div class="today-list">${sessions.map(session).join("")}${dues.map(due).join("")}</div>`;
    }
  }

  /* ---------- slipped ---------- */
  if(slipped.length){
    $("s-slipped").hidden=false;
    $("slipped").innerHTML=slipped.map(e=>`<div class="row slip${e.board?" fromboard":""}" style="${styleOf(e.area)}" data-row="${e.id||""}">
        <span class="tickcell">${tickable(e)?tick(e):""}</span>
        <span class="tag">${e.label}</span>
        <span>${titleOf(e)}${chips(e)}${e.note?`<span class="nt">${e.note}</span>`:""}</span>
        <span class="when">${shortDate(e.date)} · ${relDay(e.date)}${editBtn(e)}</span>
      </div>`).join("");
  }

  /* ---------- unscheduled ----------
     Capture that arrived without a date. Kept visible rather than filed away:
     an inbox you can't see is just a place things go to die. */
  if(loose.length){
    $("s-loose").hidden=false;
    $("loosehead").textContent="Unscheduled ("+loose.length+")";
    $("loose").innerHTML=loose.map(e=>`<div class="row ${e.kind}${e.done?" isdone":""}" style="${styleOf(e.area)}" data-row="${e.id||""}">
        <span class="tickcell">${tickable(e)?tick(e):""}</span>
        <span class="tag">${e.label}</span>
        <span><span class="ttl">${e.title}</span>${chips(e)}${e.note?`<span class="nt">${e.note}</span>`:""}</span>
        <span class="when">${Rows.schedChips(e)}${editBtn(e)}</span>
      </div>`).join("");
  }

  /* ---------- horizon ---------- */
  $("horizonhead").textContent="The next "+cfg.horizonDays+" days";
  const ahead=soon.filter(e=>e.date>TODAY), byDate={};
  ahead.forEach(e=>{(byDate[e.date]=byDate[e.date]||[]).push(e);});
  const dates=Object.keys(byDate).sort();
  $("horizon").innerHTML = dates.length ? dates.map(ds=>{
    const n=daysUntil(ds);
    return `<div class="hday${n<=3?" soon":""}">
      <div class="hdate">${shortDate(ds)}<i>${relDay(ds)}</i></div>
      <div class="hitems">${byDate[ds].map(e=>
        `<div class="hitem ${e.kind}${e.done?" isdone":""}${e.board?" fromboard":""}" style="${styleOf(e.area)}" data-row="${e.id||""}">
           <span class="tickcell">${tickable(e)?tick(e):""}</span>
           <span class="tag">${e.label}</span>
           <span>${titleOf(e)}${chips(e)}${e.time?` <span class="wt">${e.time.start}</span>`:""}</span>
           <span class="wt">${e.weight||""}${editBtn(e)}</span>
         </div>`).join("")}</div>
    </div>`;}).join("")
    : `<div class="empty">Nothing in the next ${cfg.horizonDays} days.</div>`;

  /* ---------- load ahead: one cell per piece of work, per week, by area ----------
     Deliberately not a proportional bar: a normal week holds 0–3 items, and at
     that range a bar is effectively binary. Discrete cells you can count carry
     the actual number, and still scale if a week ever gets busy. */
  const order=cfg.areas.map(a=>a.id);
  const work=all.filter(e=>e.kind!=="class" && !e.calendar);
  const cols=[];
  for(let i=0;i<WEEKS;i++){
    const from=addDays(monday,i*7), to=addDays(monday,i*7+6);
    const inWeek=work.filter(e=>e.date>=from&&e.date<=to)
                     .sort((a,b)=>order.indexOf(a.area.id)-order.indexOf(b.area.id));
    cols.push({from,to,items:inWeek});
  }
  /* ---------- and does it fit? ----------
     A count of rows is not a week's workload: a 15-minute call to Chase counts
     the same as a studio final. Grade weight isn't hours either. So each item
     carries an hours estimate — its own if it has one, a default by kind if it
     doesn't — and the week is measured against the time actually unclaimed in
     data/week.json, which is the only number here that can say "this doesn't
     fit" before the week arrives. Nothing off the shelf can compute it,
     because nothing else knows both the class schedule and the Novin hours. */
  const capacity=capacityOf(week), rest=restOf(week), room=workable(week);
  cols.forEach(c=>{
    c.hrs=c.items.filter(e=>!e.done).reduce((s,e)=>s+hoursOf(e),0);
    c.guessed=c.items.filter(e=>!e.done&&estimated(e)).length;
    c.over=capacity>0&&c.hrs>room;
  });

  const peak=Math.max(...cols.map(c=>c.items.length), 4);   // a little headroom, so a busy week visibly towers
  $("loadstrip").style.gridTemplateColumns=`repeat(${WEEKS},1fr)`;
  $("loadstrip").style.height=(peak*13+4)+"px";
  $("loadlabels").style.gridTemplateColumns=`repeat(${WEEKS},1fr)`;
  $("loadstrip").innerHTML=cols.map((c,i)=>{
    const n=c.items.length;
    const cells=c.items.map(e=>
      `<i style="background:var(${e.area.accent})${e.done?";opacity:.3":""}" title="${e.area.name} · ${e.title} · ${fmtHours(hoursOf(e))}${estimated(e)?" (estimated)":""}"></i>`).join("");
    const fit=capacity>0?` — ${fmtHours(c.hrs)} of work against ${fmtHours(capacity)} unclaimed${rest?`, ${fmtHours(rest)} of it kept for you`:""}`:"";
    return `<div class="lbar${i===0?" now":""}${c.over?" over":""}" title="week of ${shortDate(c.from)} — ${n?n+(n===1?" item":" items"):"nothing due"}${fit}">
      <div class="cells">${cells}</div></div>`;
  }).join("");
  $("loadlabels").innerHTML=cols.map(c=>{
    const d=parseISO(c.from);
    return `<div>${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`
      + (c.hrs?`<i class="lhrs${c.over?" over":""}">${fmtHours(c.hrs)}</i>`:`<i class="lhrs"></i>`)
      + `</div>`;
  }).join("");

  const quiet=cols.filter(c=>!c.items.length).map(c=>{const d=parseISO(c.from);return MONTHS[d.getMonth()].slice(0,3)+" "+d.getDate();});
  const tight=cols.filter(c=>c.over).map(c=>{const d=parseISO(c.from);return MONTHS[d.getMonth()].slice(0,3)+" "+d.getDate();});
  const guessed=cols.reduce((s,c)=>s+c.guessed,0);
  $("loadkey").innerHTML=`<span><b>One cell = one deliverable.</b> The outlined week is this one.</span>`
    + (capacity?`<span><b>${fmtHours(capacity)} a week unclaimed</b> — the open windows in the weekly grid, after class, prep, Novin and the capstone.`
        +(rest?` A week fits if it leaves <b>${fmtHours(rest)} for you</b>, wherever they fall.`:"")+`</span>`:"")
    + (tight.length?`<span class="over"><b>${rest?"No room left for you:":"Over capacity:"}</b> ${tight.join(", ")}.</span>`:"")
    + (quiet.length?`<span><b>Clear weeks:</b> ${quiet.join(", ")}.</span>`:"")
    + (guessed?`<span>${guessed} item${guessed===1?" has":"s have"} an estimated duration — set a real one with <code>~2h</code> on capture, or in the row editor.</span>`:"")
    + `<span>${cfg.areas.filter(a=>a.live&&onHome(a)).map(a=>`<em style="background:var(${a.accent})"></em>${a.name}`).join(" &nbsp; ")}</span>`;

  /* ---------- in flight: work that has a status but no date ----------
     Novin's board is status-driven, not date-driven: 20 of its 40 open items
     carry no date at all, and every date it does carry is already past. Feeding
     that into Slipped would be both noisy and wrong, so board work gets its own
     shape and its dates are shown as context, never as deadlines. */
  const boards=feeds.filter(f=>onHome(f.area)&&f.board&&f.board.items&&f.board.items.length);
  if(boards.length){
    $("s-flight").hidden=false;
    $("flight").innerHTML=boards.map(({area:a,board})=>{
      const active=board.activeStatuses||[];
      const live=board.items.filter(i=>active.includes(i.status));
      const parked=board.items.length-live.length;
      const byStatus={};
      live.forEach(i=>{(byStatus[i.status]=byStatus[i.status]||[]).push(i);});
      const groups=active.filter(st=>byStatus[st]).map(st=>
        `<div class="fgroup">
           <div class="fstatus">${st}<span>${byStatus[st].length}</span></div>
           ${byStatus[st].map(i=>`<a class="fitem" href="${i.url}" target="_blank" rel="noopener">
              <span class="ftitle">${i.title}</span>
              ${i.priority?`<span class="fprio p${i.priority.toLowerCase()}">${i.priority}</span>`:""}
              ${i.universe.length?`<span class="funi">${i.universe.join(" · ")}</span>`:""}
              ${i.due?`<span class="fdue${i.due<TODAY?" old":""}">${shortDate(i.due)}</span>`:""}
            </a>`).join("")}
         </div>`).join("");
      const stale=Math.max(0,daysBetween(board.syncedAt.slice(0,10),TODAY));
      return `<div class="flightbox" style="--area:var(${a.accent});--areabg:var(${a.accent}-bg)">
        <div class="fhead">
          <b>${a.name}</b>
          <span class="fsrc">${board.source}</span>
          <span class="fsync">${live.length} active · ${parked} parked · synced ${stale?stale+"d ago":"today"}</span>
        </div>
        <div class="fgroups">${groups}</div>
      </div>`;}).join("");
  }

  /* ---------- collisions: dated life against reserved weekly blocks ----------
     The whole point of putting Novin, the capstone and life on one page is
     seeing them land on the same day before it happens. */
  const wkBlocks=(week?.blocks||[]).filter(b=>b.type==="novin"||b.type==="capstone");
  const hhmm2=dec=>String(Math.floor(dec)).padStart(2,"0")+":"+String(Math.round((dec%1)*60)).padStart(2,"0");
  const clashes={};
  /* Only timed items can collide. An untimed one used to count as all-day and
     so overlapped every block that day, which flagged every follow-up nudge and
     reminder against Novin office hours. James asked for that to stop
     (2026-09-15): something with no time is a thing to do that day, not a
     booking. */
  soon.filter(e=>e.area.id!=="school" && e.time && e.time.start).forEach(e=>{
    const wd=(parseISO(e.date).getDay()+6)%7;
    wkBlocks.filter(b=>b.day===wd).forEach(b=>{
      if(toMins(e.time.start)>=b.end*60 || toMins(e.time.end||e.time.start)<=b.start*60) return;
      const k=e.date+"|"+b.label+"|"+b.start;
      (clashes[k]=clashes[k]||{date:e.date,block:b,items:[]}).items.push(e);
    });
  });
  const clashList=Object.values(clashes).sort((a,b)=>a.date<b.date?-1:1);
  if(clashList.length){
    $("s-clash").hidden=false;
    $("clash").innerHTML=clashList.map(({date,block,items})=>
      `<div class="row" style="--area:var(${items[0].area.accent})">
         <span class="tickcell"></span>
         <span class="tag">${shortDate(date)}</span>
         <span><span class="ttl">${block.label} · ${hhmm2(block.start)}–${hhmm2(block.end)}</span>
           <span class="nt">${items.map(i=>i.title).join(" · ")}</span></span>
         <span class="when">${relDay(date)}</span>
       </div>`).join("");
  }

  /* ---------- areas ---------- */
  $("areas").innerHTML=feeds.map(({area:a,items,error,board})=>{
    const style=`--area:var(${a.accent});--areabg:var(${a.accent}-bg)`;
    const mine=items.filter(e=>e.date>=TODAY&&e.date<=horizonEnd);
    const active=board?board.items.filter(i=>(board.activeStatuses||[]).includes(i.status)).length:0;
    const stats = !a.live || error ? []
      : board ? [{n:active, label:"active on the board"},
                 {n:board.items.length-active, label:"parked"}]
      : [{n:mine.length, label:"in the next "+cfg.horizonDays+" days"},
         {n:items.filter(e=>e.date>=TODAY).length, label:"still ahead"}];
    const inner=`<div class="atop">
        <h3><span class="dot"></span>${a.name}</h3>
        <div class="asub">${a.sub}</div>
      </div>
      ${stats.length?`<div class="astats">${stats.map(s=>`<div class="astat"><b>${s.n}</b><span>${s.label}</span></div>`).join("")}</div>`:""}
      <ul class="alines">${a.lines.map(l=>`<li>${l}</li>`).join("")}</ul>
      ${error?`<div class="anext"><b>feed didn't load</b>${error}</div>`
        : !a.live?`<div class="anext"><b>nothing here yet</b>Capture into it — type <code>@${a.id}</code> in the bar above and this area switches itself on.</div>`:""}`;
    return a.href && a.live
      ? `<a class="area" style="${style}" href="${a.href}">${inner}</a>`
      : `<div class="area stub" style="${style}">${inner}</div>`;
  }).join("");

  $("rebuild").textContent=`${all.length} dated items across ${liveCount} area${liveCount===1?"":"s"}`
    + (parked?` · ${parked} parked on someday`:"")
    + ` · ${Object.keys(done).length} ticked off · read live at ${new Date().toLocaleTimeString()}`;

  /* ================= interaction ================= */

  Rows.cfg=cfg;
  Rows.items=Object.fromEntries(every.filter(e=>e.id).map(e=>[e.id,e]));
  Rows.wire();
  const toast=(...a)=>Rows.toast(...a);

  if(undoDepth) $("rebuild").textContent+=` · ${undoDepth} change${undoDepth===1?"":"s"} undoable`;

}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't load the data files.</strong><br>${err.message}<br><br>
    ${await bootAdvice()}</div>`;
  console.error(err);
}
})();

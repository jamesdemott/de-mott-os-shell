/* De Mott OS — helpers every page shares. Loaded first. */
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const $=id=>document.getElementById(id);
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const TODAY=iso(new Date());

/* ---------------------------------------------------------------------------
   Reading data, from whichever of three places is actually reachable.

   At the desk this is exactly what it always was: a same-origin fetch, always
   cache-busted, because the whole point of the Dock icon is a fresh read.

   Away from the desk the Mac is asleep in a bag, so there is nothing on
   localhost to ask. The page falls back to the copy serve.py has been
   committing all along — 128 KB of private repo, which is the one copy of
   this data that is always up — and then to whatever the last successful read
   left behind, which is what makes a plane work.

       1. same origin   the Mac. Live, authoritative, and writable
       2. GitHub        the last push. Stale by however long, and SAYS so
       3. localStorage  the last read of either. No network at all

   Which one answers is decided ONCE per page load, by probing areas.json —
   every page loads it and it always exists — rather than letting each of the
   dozen reads fail its way down the list separately. The probe keeps its
   response, so the desktop pays no extra request for any of this.

   Staleness is never silent: dataSource() carries the commit time behind the
   data, and freshness() renders it. Same rule as syncedAt and the status
   strip — a sync that quietly stopped working must be visible, not invisible.
   --------------------------------------------------------------------------- */
const GH_REPO = "jamesdemott/de-mott-os", GH_REF = "main";
const CK = "dmos:c:";                          /* one cache key per data path */

function cacheGet(p){ try{ const v=localStorage.getItem(CK+p); return v==null?undefined:JSON.parse(v); }catch(e){ return undefined; } }
function cachePut(p,v){ try{ localStorage.setItem(CK+p, JSON.stringify(v)); localStorage.setItem("dmos:asof", new Date().toISOString()); }catch(e){} }

/* The API is CORS-open to browsers for GET and PUT with an Authorization
   header (verified against api.github.com, which answers the preflight with
   allow-methods GET, POST, PATCH, PUT, DELETE). The repo is private, so a
   missing token reads as 404 rather than as anything more helpful — that is
   why no-token is checked first and reported in its own words. */
async function ghGet(p){
  const t=localStorage.getItem("dmos:gh");
  if(!t) throw new Error("no token — open setup.html");
  const r=await fetch("https://api.github.com/repos/"+GH_REPO+"/contents/"+p+"?ref="+GH_REF,
    {headers:{Authorization:"Bearer "+t, Accept:"application/vnd.github.raw",
              "X-GitHub-Api-Version":"2022-11-28"}});
  if(r.status===401||r.status===403) throw new Error("token rejected ("+r.status+")");
  if(r.status===404){ const e=new Error(p+" → 404"); e.missing=true; throw e; }
  if(!r.ok) throw new Error("github → "+r.status);
  return r.json();
}

/* The honest "as of" is when the Mac last pushed, not when we just fetched. */
async function ghCommitted(){
  const t=localStorage.getItem("dmos:gh");
  const r=await fetch("https://api.github.com/repos/"+GH_REPO+"/commits?per_page=1&sha="+GH_REF,
    {headers:{Authorization:"Bearer "+t, "X-GitHub-Api-Version":"2022-11-28"}});
  if(!r.ok) return null;
  const c=await r.json();
  return (c[0] && c[0].commit && c[0].commit.committer && c[0].commit.committer.date) || null;
}

let _src=null;
function dataSource(){
  if(_src) return _src;
  _src=(async()=>{
    try{                                        /* 1. the Mac */
      const r=await fetch("data/areas.json?v="+Date.now(),{cache:"no-store"});
      if(r.ok) return {mode:"local", seed:await r.json()};
    }catch(e){}
    try{                                        /* 2. GitHub */
      const seed=await ghGet("data/areas.json");
      return {mode:"github", seed, asOf:await ghCommitted()};
    }catch(e){                                  /* 3. whatever we read last */
      const seed=cacheGet("data/areas.json");
      if(seed===undefined) return {mode:"none", why:e.message};
      return {mode:"cache", seed, asOf:localStorage.getItem("dmos:asof"), why:e.message};
    }
  })();
  return _src;
}

/* Every read passes through the outbox overlay on its way out, so a capture
   made on a phone shows up on Today, To-do, its area page and the review
   without any of those knowing the queue exists — and disappears from the
   queue by itself once the Mac has drained it. */
async function j(p){
  const v=await jRaw(p);
  return typeof Outbox === "undefined" ? v : Outbox.overlay(p, v);
}

async function jRaw(p){
  const s=await dataSource();
  if(p==="data/areas.json" && s.seed!==undefined){
    /* Only re-save when the seed came off a network. Writing it back in cache
       mode would re-stamp dmos:asof with the time we read our own cache, so a
       three-day-old snapshot would report itself as current — the freshness
       line exists to catch exactly that, and must not be the thing that lies. */
    if(!s.saved && s.mode!=="cache"){ cachePut(p,s.seed); s.saved=true; }
    return JSON.parse(JSON.stringify(s.seed));   /* a copy: callers mutate cfg */
  }
  if(s.mode==="none") throw new Error(p+" → offline, nothing cached ("+s.why+")");
  if(s.mode==="local"){
    const r=await fetch(p+"?v="+Date.now());
    if(!r.ok) throw new Error(p+" → "+r.status);
    const v=await r.json(); cachePut(p,v); return v;
  }
  if(s.mode==="github"){
    try{ const v=await ghGet(p); cachePut(p,v); return v; }
    catch(e){                        /* gitignored files are absent on purpose */
      const v=cacheGet(p);
      if(v!==undefined && !e.missing) return v;
      throw e;
    }
  }
  const v=cacheGet(p);
  if(v===undefined) throw new Error(p+" → not cached");
  return v;
}

/* What to tell someone whose page just failed to load. It used to be one
   fixed sentence about serve.sh and the Dock icon, which is right at the desk
   and actively misleading anywhere else — on a phone there is no Dock icon to
   press, and the real fix is almost always a token. One function so the two
   pages that print this can't drift apart. */
async function bootAdvice(){
  if(!["localhost","127.0.0.1"].includes(location.hostname))
    return "This copy reads <code>data/</code> from your private repo, because your Mac isn't "
         + "reachable from here. Set a token on the <a href=\"setup.html\">setup page</a> — "
         + "once it has read the data once, it keeps working with no network at all.";
  const s=await dataSource();
  if(s.mode==="local")
    return "The server answered but a data file didn't. Check the JSON files it names above.";
  return "This page reads <code>data/</code> over HTTP — open it via <code>./serve.sh</code> "
       + "or the Dock icon, not by double-clicking the file.";
}

/* "live" at the desk; "as of Fri 19 Sep, 8:04pm" anywhere else. Never a bare
   page that looks current when it is three days old. */
async function freshness(){
  const s=await dataSource();
  if(s.mode==="local")  return {live:true,  text:"live"};
  if(s.mode==="none")   return {live:false, text:"no data — "+s.why, bad:true};
  if(!s.asOf)           return {live:false, text:"as of an unknown time", bad:true};
  const d=new Date(s.asOf), mins=Math.round((Date.now()-d)/60000);
  const ago = mins<2 ? "just now" : mins<60 ? mins+" min ago"
            : mins<1440 ? Math.round(mins/60)+"h ago" : Math.round(mins/1440)+"d ago";
  return {live:false, bad:mins>2880,
          text:"as of "+shortDate(iso(d))+", "+ago+(s.mode==="cache"?" · offline copy":"")};
}

const parseISO=ds=>new Date(ds+"T00:00:00");
const shortDate=ds=>{const d=parseISO(ds);return DAYS[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()].slice(0,3);};

/* Calendar arithmetic, never millisecond arithmetic. Adding n*864e5 loses an
   hour when DST ends (1 Nov 2026 here), which silently skips a whole day:
   both +1 and +2 from 31 Oct used to land on 1 Nov, shifting every date in
   November — the busiest stretch of the term — by one. setDate/Date.UTC work
   in calendar terms and are immune. */
const addDays=(ds,n)=>{const d=parseISO(ds);d.setDate(d.getDate()+n);return iso(d);};
const dayNum=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5;
const daysBetween=(a,b)=>dayNum(parseISO(b))-dayNum(parseISO(a));
const daysUntil=ds=>daysBetween(TODAY,ds);
const relDay=ds=>{const n=daysUntil(ds);return n===0?"today":n===1?"tomorrow":n<0?Math.abs(n)+"d ago":"in "+n+"d";};

/* A dashboard left open overnight is worse than no dashboard: TODAY is frozen at
   load, so every "today" and "in 3d" on the page quietly becomes wrong with no
   visible tell. Re-read when the date rolls over — on the minute if the tab is
   on screen, and the moment it comes back to the front if it wasn't. */
(function(){
  const rolled=()=>iso(new Date())!==TODAY;
  const refresh=()=>{ if(rolled()) location.reload(); };
  setInterval(refresh,60000);
  addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") refresh(); });
})();

/* ---------------------------------------------------------------- recurrence

   A repeating item is stored as ONE row carrying a `repeat` rule, never as the
   occurrences it implies:

       { "date":"2026-09-14", "title":"Rent", "repeat":{"every":"month"} }
       { "date":"2026-09-14", "title":"Standup", "repeat":{"every":"week","on":["mon","thu"]} }
       { "date":"2026-09-14", "title":"Water plants", "repeat":{"every":"day","n":3} }

   `date` is the anchor — the first occurrence, never before it. Storing the
   expansion instead would bloat the feed, make "edit the series" impossible,
   and turn one daily habit into hundreds of rows to tick off. So the pages
   expand a rule across whatever window they happen to be showing.

   Each occurrence ticks off under its own key, `id@YYYY-MM-DD`, so ticking
   this Monday's does not tick next Monday's. */

const WEEK3 = ["mon","tue","wed","thu","fri","sat","sun"];
const wdIndex = ds => (parseISO(ds).getDay() + 6) % 7;      // 0 = Monday
const OCC_LIMIT = 500;      // a rule can't out-run its window, whatever it says

function occurrences(e, from, to){
  const r = e.repeat;
  if(!r || !e.date || !r.every) return [];
  const stop = r.until && r.until < to ? r.until : to;
  if(stop < e.date || stop < from) return [];
  const n = Math.max(1, r.n || 1);
  const out = [];
  let guard = 0;

  if(r.every === "week" && r.on && r.on.length){
    let cur = addDays(e.date, -wdIndex(e.date));            // Monday of the anchor's week
    while(cur <= stop && guard++ < OCC_LIMIT){
      for(const d of r.on){
        const day = addDays(cur, WEEK3.indexOf(d));
        if(day >= e.date && day >= from && day <= stop) out.push(day);
      }
      cur = addDays(cur, 7 * n);
    }
  } else if(r.every === "day" || r.every === "week"){
    const step = r.every === "day" ? n : 7 * n;
    let cur = e.date;
    // Jump straight to the window rather than walking a year of days to reach it.
    if(cur < from) cur = addDays(cur, Math.floor(daysBetween(cur, from) / step) * step);
    while(cur < from) cur = addDays(cur, step);
    while(cur <= stop && guard++ < OCC_LIMIT){
      out.push(cur);
      cur = addDays(cur, step);
    }
  } else if(r.every === "month" || r.every === "year"){
    /* Walk in calendar months and keep the anchor's day-of-month. A 31st SKIPS
       February rather than sliding to the 28th: a rule that says "the 31st"
       and silently fires on the 28th is worse than one that doesn't fire. */
    const anchor = parseISO(e.date), dom = anchor.getDate();
    const step = r.every === "month" ? n : 12 * n;
    let y = anchor.getFullYear(), mo = anchor.getMonth();
    while(guard++ < OCC_LIMIT){
      const last = new Date(y, mo + 1, 0).getDate();
      const ds = iso(new Date(y, mo, Math.min(dom, last)));
      if(ds > stop) break;
      if(dom <= last && ds >= from && ds >= e.date) out.push(ds);
      mo += step; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    }
  }
  return out.sort();
}

/* Every row a day view should show between from..to. One-offs pass through;
   repeats become one row per occurrence. `key` is what gets ticked. */
function expand(items, from, to){
  const out = [];
  for(const e of items){
    if(e.repeat && e.date){
      for(const d of occurrences(e, from, to))
        // `anchor` is the stored date the rule repeats from. The editor needs
        // it: saving an occurrence must not quietly move the whole series onto
        // whichever Monday happened to be on screen.
        out.push({...e, date:d, key:e.id + "@" + d, occ:true, anchor:e.date});
    }else{
      out.push({...e, key:e.id});
    }
  }
  return out;
}

const repeatLabel = r => {
  if(!r || !r.every) return "";
  const n = r.n || 1;
  if(r.every === "week" && r.on && r.on.length)
    return (n > 1 ? `every ${n} wks · ` : "every ") + r.on.map(d => d[0].toUpperCase()+d.slice(1)).join(", ");
  const unit = {day:"day", week:"week", month:"month", year:"year"}[r.every];
  return n > 1 ? `every ${n} ${unit}s` : `every ${unit}`;
};

/* ---------------------------------------------------------------- effort

   Hours are what a week is actually spent in; grade weight is not, and neither
   is a count of rows. An item without an estimate gets one by kind so the
   capacity read is never blank — a stated guess you can correct beats no
   number at all. Estimated values are marked as such wherever they're shown. */
const HOUR_DEFAULTS = { due: 2, admin: 0.5, class: 0, "": 1 };
const hoursOf   = e => e.hours != null ? e.hours : (HOUR_DEFAULTS[e.kind] ?? 1);

/* Capacity, and the floating rest budget inside it. `open` windows in
   data/week.json are the time genuinely unclaimed; `restHours` is how much of
   that a week must leave over to count as fitting — not a fenced-off block,
   because a Saturday-night deadline may need Saturday (James, 2026-09-29).
   It is slack in the proven sense: the reserve is real, its position floats.
   Every page that says "fits" asks workable(), never capacity alone. */
const capacityOf = week => (week?.open || []).reduce((s, o) => s + (o.end - o.start), 0);
const restOf     = week => Math.max(0, +(week?.restHours) || 0);
const workable   = week => Math.max(0, capacityOf(week) - restOf(week));

/* The whole hours read can be switched off: `"hoursRead": false` in
   data/areas.json (2026-09-29). James: readings are ad hoc — light one week,
   brutal the next — and personal time isn't worked out yet, so every
   estimated hours figure and every fits / doesn't-fit judgement was a precise
   number that meant nothing. With it off, pages show counts of real things
   only. Hours he typed himself (~2h) still show on their own rows: those are
   his, not a guess. The machinery stays, so turning it back on is one word. */
const hoursOn    = cfg => !(cfg && cfg.hoursRead === false);

/* His Google calendars (data/calendar/events.json), split the way every
   calendar app splits them: timed events are rows, all-day ones are a note
   on the day. 44 of the first 96 events were all-day reminders — trash day,
   pay day, street sweeping, weigh-ins — and as full rows they buried the
   day view (2026-09-29). cfg.calendarHide drops titles containing any of its
   strings (case-insensitive), for phone clutter like "Alarm notification".
   Titles arrive HTML-escaped from the sync; they stay that way. */
function calendarSplit(doc, cfg){
  const hide = (cfg && cfg.calendarHide || []).map(h => String(h).toLowerCase());
  const keep = c => !hide.some(h => String(c.title).toLowerCase().includes(h));
  const items = (doc && doc.items || []).filter(keep);
  const notes = {};
  items.filter(c => !c.time).forEach(c => {
    const list = (notes[c.date] = notes[c.date] || []);
    if(!list.includes(c.title)) list.push(c.title);
  });
  return { timed: items.filter(c => c.time), notes };
}
const estimated = e => e.hours == null;
const fmtHours  = h => (Math.round(h * 10) / 10) + "h";

/* Active means: not parked on the someday list, not archived. */
const isActive = e => !e.status;


/* ---------------------------------------------------------------------------
   The service worker, and the one place it must not run.

   Registered everywhere EXCEPT localhost. At the desk the whole point of the
   Dock icon is a fresh read, and a shell cache sitting in front of serve.py is
   how you get a browser confidently serving last week's JavaScript and a
   session wondering why the edit didn't work — the same failure the port move
   off 8787 was about. Away from the desk there is no server to be fresh
   against, and the cache is the only reason the Home Screen icon opens
   anything at all. So: off here, on there.
   --------------------------------------------------------------------------- */
/* The test is the protocol, not the hostname: the Mac is always plain http
   and anywhere this is hosted is always https, so one condition says exactly
   "don't put a cache in front of serve.py" with nothing to keep in sync. */
if("serviceWorker" in navigator && location.protocol === "https:"){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
}

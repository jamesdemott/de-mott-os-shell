/* De Mott OS · the weekly review.
   -------------------------------------------------------------------------
   This page adds no new data and no new store. Every row on it is the same
   item the front page and the area lists already show — the difference is
   that here each one is a question with buttons, not a line to read past.

   That distinction is the whole reason it exists. Capture was already good;
   what was missing was the pass where things get decided. Without it
   "Slipped" grows without limit, and the moment you start scrolling past one
   section you stop trusting the whole page. A list that only ever grows is
   how a system like this dies — not from missing features, from going stale.

   Five steps, in the order they need answering:
     1. slipped        — dated, past, still open. Do it, move it, drop it.
     2. sitting        — captured with no date and no longer fresh.
     3. parked         — the someday list, resurfaced on purpose.
     4. week ahead     — read-only, and does it fit in the hours available.
     5. closed         — what actually got finished, which nothing else shows.
*/

const STALE_DAYS = 14;      // how long an undated capture may sit before it's asked about

(async function(){
try{
  const cfg=await j("data/areas.json");
  /* Titled by the week it prepares — "Week 7 preview" on a Sunday — because
     the pass looks forward (James, 2026-09-29; it was "The Sunday Edition",
     then nearly "Week 6, reviewed", which pointed the wrong way). */
  const meta=cfg.ears?.term?await j(cfg.ears.term).catch(()=>null):null;
  const pvTitle=weekTitle(meta,previewMonday(TODAY))+" preview";
  document.getElementById("pagetitle").textContent=pvTitle;
  document.title=pvTitle+" · De Mott OS";
  Nav.render(cfg,"review");
  const state=await j("data/state.json").catch(()=>({done:{},undo:[]}));
  const done=state.done||{};
  const week=await j("data/week.json").catch(()=>null);

  /* ---------- load every locally-owned item ----------
     Only areas with a feed: a synced board belongs to Notion, and offering
     "archive" on a row James can't actually change here would be a lie. */
  const perArea=await Promise.all(cfg.areas.map(async a=>{
    if(!a.live || !a.feed) return [];
    const raw=await j(a.feed).catch(()=>[]);
    const labels=a.labels ? await j(a.labels).catch(()=>null) : null;
    return raw.filter(e=>e&&e.title).map(e=>({
      id:e.id, date:e.date||null, title:e.title, kind:e.kind||"", note:e.note||"",
      time:e.time||null, repeat:e.repeat||null, status:e.status||"",
      hours:e.hours!=null?e.hours:null, project:e.project||"", added:e.added||null,
      label: e.label || (labels && e.course && labels[e.course] ? labels[e.course].code : a.name),
      area:a
    }));
  }));
  const stored=perArea.flat();
  const byId=Object.fromEntries(stored.map(e=>[e.id,e]));

  /* ---------- the five piles ---------- */

  /* Recurring items are excluded: a missed instance isn't a decision to make,
     and the rule itself is still perfectly good. */
  const slipped=stored.filter(e=>e.date && e.date<TODAY && !done[e.id]
    && !e.repeat && !e.status && (e.kind==="due"||e.kind==="admin"||e.kind===""));

  /* Age is unknown for anything captured before `added` existed. Unknown is
     treated as old on purpose — those are precisely the ones that have been
     sitting longest. */
  const ageOf=e=>e.added?daysBetween(e.added,TODAY):null;
  const sitting=stored.filter(e=>!e.date && !e.status && !done[e.id])
                      .filter(e=>{const a=ageOf(e); return a===null||a>=STALE_DAYS;});

  const parked=stored.filter(e=>e.status==="someday" && !done[e.id]);

  const soon=expand(stored.filter(e=>!e.status && !done[e.id]), TODAY, addDays(TODAY,7))
    .filter(e=>e.date && e.date>=TODAY && e.date<=addDays(TODAY,7) && e.kind!=="class")
    .sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);

  /* Anything in the coming week that is just for him — the review's version
     of the Sunday Edition's "For you this week" line. Behavioral activation:
     book the good things on purpose, not only the obligations. What counts is
     cfg.forYou. Asked once, in the week-ahead step, in plain words. */
  const fy=cfg.forYou||{areas:[],calendars:[]};
  const cal=(fy.calendars||[]).length&&cfg.calendar?await j(cfg.calendar).catch(()=>null):null;
  const forYou=soon.filter(e=>(fy.areas||[]).includes(e.area.id)).map(e=>e.title)
    .concat((cal?.items||[]).filter(c=>(fy.calendars||[]).includes(c.calendar)
      && c.date>=TODAY && c.date<=addDays(TODAY,7)).map(c=>c.title));
  const forYouLine=forYou.length
    ? ` <br><b>Just for you:</b> ${forYou.slice(0,4).join(" · ")}${forYou.length>4?` and ${forYou.length-4} more`:""}.`
    : ` <br><b>Nothing booked just for you this week.</b> Worth adding one thing — a meal, a walk, a show. Capture it with <code>@life</code>.`;

  /* What got finished. state.json stamps an ISO time on every tick, so this
     is the one view that can answer "what did I actually do this week" —
     motivating, and the fastest way to notice an area has gone silent. */
  const since=addDays(TODAY,-7);
  const closed=Object.entries(done)
    .filter(([,when])=>when && String(when).slice(0,10)>=since)
    .map(([key,when])=>{
      const [id,occ]=String(key).split("@");
      const item=byId[id];
      return item?{...item, key, date:occ||item.date, closedAt:String(when).slice(0,10)}:null;
    })
    .filter(Boolean)
    .sort((a,b)=>a.closedAt<b.closedAt?1:-1);

  /* ---------- header ---------- */
  const decisions=slipped.length+sitting.length+parked.length;
  const showHrs=hoursOn(cfg);
  const capacity=showHrs?capacityOf(week):0, rest=restOf(week), room=workable(week);
  const aheadHrs=soon.filter(e=>!done[e.key]).reduce((s,e)=>s+hoursOf(e),0);

  $("statrow").innerHTML=[
    {n:decisions, label:decisions===1?"thing to decide":"things to decide", flag:decisions>0},
    {n:slipped.length, label:"carried over", flag:false},
    {n:closed.length, label:"closed in the last 7 days", flag:false}
  ].map(s=>`<div class="stat${s.flag?" flag":""}"><b>${s.n}</b><span>${s.label}</span></div>`).join("")
   + (capacity?`<div class="stat${aheadHrs>room?" slip":""}"><b>${fmtHours(aheadHrs)}</b><span>next 7 days, against ${fmtHours(capacity)} free</span></div>`:"");

  /* ---------- one row, with the decisions on it ---------- */
  const styleOf=a=>`--area:var(${a.accent});--areabg:var(${a.accent}-bg)`;
  const chips=e=>
      (e.repeat?`<span class="chip rep">↻ ${repeatLabel(e.repeat)}</span>`:"")
    + (e.project?`<span class="chip proj">/${e.project}</span>`:"")
    + (e.hours?`<span class="chip hrs">${fmtHours(e.hours)}</span>`:"");

  const ageNote=e=>{
    const a=ageOf(e);
    return a===null?`<span class="age">age unknown</span>`
      : a>=STALE_DAYS?`<span class="age old">sitting ${a}d</span>`
      : `<span class="age">${a}d old</span>`;
  };

  /* The buttons ARE the review. Each one is a decision that takes the row off
     this page, so a pass through it actually drains rather than reshuffles. */
  const decide=(e,opts)=>`<span class="decide">
      ${opts.includes("today")   ? `<button class="mini" data-do="date"    data-v="${TODAY}"          data-a="${e.area.id}" data-i="${e.id}">today</button>`:""}
      ${opts.includes("week")    ? `<button class="mini" data-do="date"    data-v="${addDays(TODAY,7)}" data-a="${e.area.id}" data-i="${e.id}">+1 week</button>`:""}
      ${opts.includes("someday") ? `<button class="mini" data-do="someday" data-a="${e.area.id}" data-i="${e.id}">someday</button>`:""}
      ${opts.includes("wake")    ? `<button class="mini" data-do="wake"    data-a="${e.area.id}" data-i="${e.id}">back to active</button>`:""}
      ${opts.includes("archive") ? `<button class="mini" data-do="archive" data-a="${e.area.id}" data-i="${e.id}">archive</button>`:""}
      ${Rows.editBtn(e)}
    </span>`;

  const rowOf=(e,opts,extra="")=>`<div class="rvrow ${e.kind}" style="${styleOf(e.area)}" data-row="${e.id}">
      <span class="tickcell">${Rows.tickable(e)?Rows.tick(e):""}</span>
      <span class="rvmain">
        <span class="ttl">${e.title}</span>${chips(e)}
        <span class="nt"><em class="lareatag">${e.label}</em>${extra}${e.note?" · "+e.note:""}</span>
      </span>
      ${decide(e,opts)}
    </div>`;

  /* ---------- the steps ---------- */
  const step=(n,head,note,body,count)=>`<section class="step${count?"":" clear"}">
      <div class="shead">
        <h2><span class="stepn">${n}</span>${head}${count?` <span class="lcount">${count}</span>`:""}</h2>
        <p class="note">${note}</p>
      </div>
      ${count?body:`<div class="empty">Nothing to decide here.</div>`}
    </section>`;

  const list=html=>`<div class="rvgroup">${html}</div>`;

  $("steps").innerHTML=[
    step(1,"Carried over",
      "Past its date and still open. That happens to every list, and it isn't a verdict on the week — what helps is a decision rather than a guilty feeling: give it a day, park it, or let it go.",
      list(slipped.map(e=>rowOf(e,["today","week","someday","archive"],
        ` · was ${shortDate(e.date)}, ${relDay(e.date)}`)).join("")), slipped.length),

    step(2,"Sitting without a date",
      `Captured and never scheduled. Anything ${STALE_DAYS} days old or older is asked about here: give it a day, park it honestly, or let it go.`,
      list(sitting.map(e=>rowOf(e,["today","week","someday","archive"],
        ` · ${ageNote(e)}`)).join("")), sitting.length),

    step(3,"Someday",
      "Deliberately parked. This is the step that keeps the someday list from becoming a place things go to die — look at it once a week and it stays honest.",
      list(parked.map(e=>rowOf(e,["today","week","archive"])).join("")), parked.length),

    step(4,"The week ahead",
      (capacity
        ? `Read-only. ${fmtHours(aheadHrs)} of work against ${fmtHours(capacity)} genuinely unclaimed — ${aheadHrs>capacity
            ?"<b>that doesn't fit.</b> Better to move something now, on purpose, than have it carried over later."
            :aheadHrs>room?`it fits, <b>but leaves less than ${fmtHours(rest)} for you.</b> Worth moving one thing, or deciding which evening stays free.`
            :rest?`that fits, with at least ${fmtHours(rest)} left for you.`:"that fits."}`
        : "Read-only — what's actually coming.")+forYouLine,
      list(soon.map(e=>`<div class="rvrow ${e.kind}" style="${styleOf(e.area)}">
          <span class="tickcell"></span>
          <span class="rvmain"><span class="ttl">${e.title}</span>${chips(e)}
            <span class="nt"><em class="lareatag">${e.label}</em> · ${shortDate(e.date)}, ${relDay(e.date)}</span></span>
          <span class="decide"><span class="age">${showHrs?fmtHours(hoursOf(e))+(estimated(e)?" est.":""):""}</span></span>
        </div>`).join("")), soon.length),

    step(5,"Closed in the last 7 days",
      "What actually got finished. Nothing else in De Mott OS shows this, and it is the fastest way to notice an area has gone quiet.",
      list(closed.map(e=>`<div class="rvrow isdone" style="${styleOf(e.area)}">
          <span class="tickcell"></span>
          <span class="rvmain"><span class="ttl">${e.title}</span>
            <span class="nt"><em class="lareatag">${e.label}</em> · ticked ${shortDate(e.closedAt)}</span></span>
        </div>`).join("")), closed.length)
  ].join("");

  /* The paper loop. The Sunday Edition prints a "write it down" box and a
     line per day; this is where those notes come back in, before anything
     else gets decided (the Bullet Journal migration). Asked on the review's
     own days — Saturday to Monday — and only as a line, never a step to pass. */
  const dow=parseISO(TODAY).getDay();
  if(dow===6||dow===0||dow===1){
    const sub=document.getElementById("pagesub");
    if(sub) sub.insertAdjacentHTML("afterend",
      `<p class="paperprompt"><b>First:</b> anything written on last week's printed edition? Capture it before you start — then the sheet can go.</p>`);
  }

  $("rebuild").textContent = decisions
    ? `${decisions} decision${decisions===1?"":"s"} waiting · read live at ${new Date().toLocaleTimeString()}`
    : `Nothing waiting on a decision — the list is current. Read live at ${new Date().toLocaleTimeString()}.`;

  /* ---------- the decision buttons ---------- */
  Rows.cfg=cfg;
  Rows.items=Object.fromEntries(stored.map(e=>[e.id,e]));
  Rows.wire();

  document.addEventListener("click", async ev=>{
    const b=ev.target.closest("[data-do]");
    if(!b) return;
    ev.preventDefault();
    const {do:what, v, a, i}=b.dataset;
    /* Parking clears the date for the same reason the editor does: a parked
       item with a stale date drops straight back into Slipped when it wakes. */
    const patch = what==="date"    ? {date:v, status:""}
                : what==="someday" ? {status:"someday", date:null, repeat:null}
                : what==="wake"    ? {status:""}
                :                    {status:"archived"};
    b.disabled=true;
    try{
      await post("/api/update",{area:a, id:i, patch});
      location.reload();
    }catch(err){ b.disabled=false; Rows.toast("Couldn't save: "+err.message); }
  });

}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't build the review.</strong><br>${err.message}<br><br>
    This page reads <code>data/</code> over HTTP — open it via <code>./serve.sh</code> or the dock icon.</div>`;
  console.error(err);
}
})();

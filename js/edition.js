/* De Mott OS · the Sunday Edition — the week ahead as one printed page.

   The review (review.html) is where the week gets decided; this is its front
   page, the thing you read over coffee before deciding anything. It adds no
   data and asks nothing: every row is one the front page already shows.

   It exists to be delivered. print_edition.sh prints it to PDF on Sunday
   morning and drops it where the phone can open it, so the week arrives
   instead of waiting to be looked at — the weekly-digest pattern, which is
   the most durable habit hook there is. Everything below is therefore
   written to survive a headless browser: no interaction, and the page marks
   itself ready (body[data-ready]) when the last fetch has landed.

   Private areas never appear. Health stays on this Mac, and this is the one
   page designed to leave it. Areas with "home": false stay off too, for the
   same reason they are off the front page. */

/* ?print=reading prints the earlier portrait layout instead of the desk
   sheet. Set before anything renders so the swapped @page is in place. */
if(new URLSearchParams(location.search).get("print")==="reading"){
  document.body.classList.add("print-read");
  const pg=document.createElement("style");
  pg.textContent="@page{size:Letter portrait;margin:.55in .6in}";
  document.head.appendChild(pg);
}

(async function(){
try{
  const cfg=await j("data/areas.json");
  Nav.render(cfg,"review");
  const state=await j("data/state.json").catch(()=>({done:{}}));
  const done=state.done||{};
  const week=await j("data/week.json").catch(()=>null);
  const scentData=cfg.scent?await j(cfg.scent).catch(()=>null):null;
  const $=id=>document.getElementById(id);

  /* On a weekend it is next week's paper; midweek it is this week's. */
  const dow=parseISO(TODAY).getDay();                  // 0 = Sunday
  const start=dow===0?addDays(TODAY,1):dow===6?addDays(TODAY,2):addDays(TODAY,-(dow-1));
  const end=addDays(start,6);
  const fmt=ds=>{const d=parseISO(ds);return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;};

  /* ---------- the items ---------- */
  const areas=cfg.areas.filter(a=>a.live && a.feed && !a.private && a.home!==false);
  const stored=(await Promise.all(areas.map(async a=>{
    const raw=await j(a.feed).catch(()=>[]);
    const labels=a.labels?await j(a.labels).catch(()=>null):null;
    return raw.filter(e=>e&&e.title).map(e=>({
      id:e.id, date:e.date||null, title:e.title, kind:e.kind||"", note:e.note||"",
      time:e.time||null, repeat:e.repeat||null, status:e.status||"",
      hours:e.hours!=null?e.hours:null, weightNum:e.weightNum||0, weight:e.weight||"",
      course:e.course||null,
      label:e.label||(labels&&e.course&&labels[e.course]?labels[e.course].code:a.name), area:a
    }));
  }))).flat();
  const byId=Object.fromEntries(stored.map(e=>[e.id,e]));

  const cal=cfg.calendar?await j(cfg.calendar).catch(()=>null):null;
  const calSplit=calendarSplit(cal,cfg);
  const meetings=calSplit.timed.filter(c=>c.date>=start&&c.date<=end).map(c=>({
    date:c.date, title:c.title, time:c.time||null, label:c.calendar, kind:"event",
    area:{accent:"--a-cal"}
  }));

  const inWeek=expand(stored.filter(e=>!e.status),start,end)
    .filter(e=>e.date&&e.date>=start&&e.date<=end)
    .map(e=>({...e,done:!!done[e.key||e.id]}));
  const rows=inWeek.concat(meetings).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:
    (a.time?.start||"").localeCompare(b.time?.start||""));

  /* ---------- the figures ---------- */
  const work=inWeek.filter(e=>e.kind!=="class"&&!e.done);
  const dues=work.filter(e=>e.kind==="due");
  const hrs=work.reduce((s,e)=>s+hoursOf(e),0);
  const guessed=work.filter(estimated).length;
  const capacity=capacityOf(week), rest=restOf(week), room=workable(week);
  const slipped=stored.filter(e=>e.date&&e.date<TODAY&&!done[e.id]&&!e.repeat&&!e.status
    &&(e.kind==="due"||e.kind==="admin"||e.kind===""));
  const someday=stored.filter(e=>e.status==="someday"&&!done[e.id]).length;
  const since=addDays(start,-7);
  const closed=Object.entries(done)
    .filter(([k,w])=>w&&String(w).slice(0,10)>=since&&String(w).slice(0,10)<start&&!k.startsWith("prep:"))
    .map(([k])=>byId[String(k).split("@")[0]]).filter(Boolean);

  /* ---------- the headline ----------
     Chosen by what is true, in order of what matters: the heaviest graded
     thing landing this week, then whether the week fits, then its shape. */
  const big=dues.slice().sort((a,b)=>b.weightNum-a.weightNum)[0];
  const bigW=cfg.ears?.bigWeight||20;
  const over=capacity>0&&hrs>capacity, tight=!over&&capacity>0&&hrs>room;
  const clip=(t,n)=>t.length>n?t.slice(0,n-1).trimEnd()+"…":t;
  const headline =
      big&&big.weightNum>=bigW ? `${clip(big.title,64)} lands ${DAYS[parseISO(big.date).getDay()]}.`
    : over                     ? `An overbooked week: ${fmtHours(hrs)} of work, ${fmtHours(capacity)} free.`
    : tight                    ? `A full week: it fits, with less than ${fmtHours(rest)} left for you.`
    : !dues.length             ? "A quiet week."
    : `${dues.length} deadline${dues.length===1?"":"s"}, none of them heavy.`;
  $("ed-headline").textContent=headline;
  document.title=`The Sunday Edition — ${headline}`;

  const nMeet=meetings.filter(m=>m.time).length;
  const stand=[
    big&&big.weightNum>=bigW?`${big.label}, worth ${big.weight||big.weightNum+"%"}.`:"",
    `${dues.length} thing${dues.length===1?"":"s"} due`
      +(nMeet?` and ${nMeet} meeting${nMeet===1?"":"s"} on the calendar`:"")+".",
    capacity?`About ${fmtHours(hrs)} of the ${fmtHours(capacity)} unclaimed is spoken for${guessed?", estimated":""}`
      +(rest?(tight||over?`, leaving less than the ${fmtHours(rest)} you keep for yourself.`:`, and your ${fmtHours(rest)} for yourself is intact.`):".") :"",
    slipped.length?`${slipped.length} still open from before.`:""
  ].filter(Boolean);
  $("ed-stand").textContent=stand.join(" ");

  $("ed-figures").innerHTML=[
    {n:dues.length,label:"due"},
    {n:fmtHours(hrs),label:`of ${fmtHours(capacity)} free`,warn:over||tight,cls:"hrs"},
    {n:slipped.length,label:"carried over",warn:slipped.length>0},
    {n:closed.length,label:"closed last week"},
    {n:someday,label:"on someday"}
  ].map(s=>`<div class="stat${s.warn?" slip":""}${s.cls?" "+s.cls:""}"><b>${s.n}</b><span>${s.label}</span></div>`).join("");

  /* ---------- for you this week ----------
     Behavioral activation — the best-evidenced piece of CBT for low mood —
     comes down to deliberately booking things that are enjoyable or
     meaningful, not only obligations. Everything else on this page is an
     obligation, so this line asks the one question it can't: is anything
     here just for you? What counts is cfg.forYou (areas, and calendars by
     name). When nothing does, it says so plainly, once, and points at the
     review, which asks the same question. Never a score, never a streak. */
  const fy=cfg.forYou||{areas:[],calendars:[]};
  const mine=inWeek.filter(e=>(fy.areas||[]).includes(e.area.id)&&e.kind!=="class")
    .concat(meetings.filter(m=>(fy.calendars||[]).includes(m.label)))
    .sort((a,b)=>a.date<b.date?-1:1);
  $("ed-foryou").innerHTML=mine.length
    ? `<b>For you this week:</b> ${mine.slice(0,5).map(e=>`${e.title} <span>(${DAYS[parseISO(e.date).getDay()]})</span>`).join(" · ")}`
      +(mine.length>5?` · and ${mine.length-5} more`:"")
    : `<b>For you this week:</b> nothing booked just for you yet — worth fixing in the review.`;
  $("ed-foryou").classList.toggle("none",!mine.length);

  /* ---------- the week, day by day ---------- */
  /* A turn-in: a course deliverable that is actually due — something has to
     be submitted. It gets a highlighter band on screen and on both papers
     (asked 2026-09-29). Admin deadlines (a return, a form) stay bold but
     unbanded, so the band only ever means "hand something in". */
  const turnIn=e=>e.kind==="due"&&!!e.course;
  const row=e=>`<div class="ed-row ${e.kind}${turnIn(e)?" turnin":""}${e.done?" isdone":""}" style="--area:var(${e.area.accent})">
      <span class="ed-t">${turnIn(e)?"turn in":e.time?e.time.start:e.kind==="due"?"due":""}</span>
      <span class="ed-tag">${e.label}</span>
      <span class="ed-ttl">${e.title}${e.weight&&e.kind==="due"?` <em>${e.weight}</em>`:""}</span>
    </div>`;
  const days=[...Array(7)].map((_,i)=>addDays(start,i));
  const paintWeek=wx=>{
    $("ed-week").innerHTML=days.map(ds=>{
      const f=wx?.days?.find(d=>d.date===ds);
      const mine=rows.filter(e=>e.date===ds);
      return `<div class="ed-day${ds===TODAY?" today":""}">
        <div class="ed-dh"><b>${fmt(ds)}</b>${f?`<span class="ed-wx">${f.hi}° / ${f.lo}° · ${Weather.words(f.code)}${f.rain>=30?` · ${f.rain}% rain`:""}</span>`:""}</div>
        ${calSplit.notes[ds]?`<div class="ed-also">${calSplit.notes[ds].join(" · ")}</div>`:""}
        ${mine.length?mine.map(row).join(""):`<div class="ed-none">Nothing booked.</div>`}
      </div>`;}).join("");
  };
  paintWeek(null);

  if(slipped.length){
    $("ed-slipped").hidden=false;
    $("ed-slipped-list").innerHTML=slipped.slice(0,8).map(e=>row({...e,time:null,kind:"due"})
      .replace(`<span class="ed-t">due</span>`,`<span class="ed-t">${shortDate(e.date)}</span>`)).join("")
      +(slipped.length>8?`<div class="ed-none">and ${slipped.length-8} more — see the review.</div>`:"");
  }
  $("ed-closed-list").innerHTML=closed.length
    ? closed.slice(0,12).map(e=>`<div class="ed-row done-rec" style="--area:var(${e.area.accent})"><span class="ed-t">✓</span><span class="ed-tag">${e.label}</span><span class="ed-ttl">${e.title}</span></div>`).join("")
      +(closed.length>12?`<div class="ed-none">and ${closed.length-12} more.</div>`:"")
    : `<div class="ed-none">Nothing ticked off. A week can be like that; the record says so rather than hiding it.</div>`;

  $("ed-date").textContent=`Week of ${fmt(start)} ${parseISO(start).getFullYear()}`;
  const meta=cfg.ears?.term?await j(cfg.ears.term).catch(()=>null):null;
  if(meta?.termStart&&start>=meta.termStart&&(!meta.termEnd||start<=meta.termEnd))
    $("ed-no").textContent=`Week ${Math.floor(daysBetween(meta.termStart,start)/7)+1} of ${cfg.ears.termName||"the term"}`;
  $("ed-colophon").textContent=`Printed ${new Date().toLocaleString([], {weekday:"long", hour:"numeric", minute:"2-digit"})} from De Mott OS · `
    +`${inWeek.length+meetings.length} items this week · hours are estimates where marked · private areas are never printed`;

  /* ---------- the desk edition: what actually prints ----------
     The screen page is for reading; this is for a desk, all week, with a pen.
     Built on the week-on-one-page planner and Newport's time-block planner —
     the paper formats that last because they are written on: one landscape
     sheet, seven day columns each ending in ruled lines, a hand-tickable box
     on every deadline, a blank for the week's one thing, and a "write it
     down" box. The review asks what got written there (review.js), which is
     the Bullet Journal migration that brings paper back into the system.
     Each day also carries its forecast and a scent pick (js/scent.js). */
  const termWeek=$("ed-no").textContent;
  const deskRow=e=>{
    const tick=e.kind==="due"||e.kind==="admin"||e.kind==="";
    const lab=e.kind==="event"?e.label:e.label.replace(/^(\w+ \d+).*$/,"$1");
    return `<div class="dk-it ${e.kind||"todo"}${turnIn(e)?" turnin":""}${e.done?" isdone":""}">`
      +(tick&&e.kind!=="event"?`<span class="dk-ck"></span>`:`<span class="dk-t">${e.time?e.time.start:""}</span>`)
      +`<span class="dk-tt">${tick&&e.kind!=="event"&&e.time?`<em>${e.time.start}</em> `:""}${clip(e.title,54)}<i> · ${lab}</i></span></div>`;
  };
  const paintDesk=wx=>{
    const cols=days.map(ds=>{
      const d=parseISO(ds), f=wx?.days?.find(x=>x.date===ds);
      const items=rows.filter(e=>e.date===ds);
      const wd=(d.getDay()+6)%7, hol=(week?.holidays||[]).includes(ds);
      const sc=scentData&&typeof Scent!=="undefined"?Scent.pick(scentData,{items,
        officeDay:!hol&&(week?.blocks||[]).some(b=>b.type==="novin"&&b.day===wd),
        classDay:items.some(e=>e.kind==="class"),forecast:f||null}).day:null;
      const cap=8, extra=items.length-cap;
      return `<div class="dk-day">
        <div class="dk-dh"><b>${DAYS[d.getDay()]} ${d.getDate()}</b>${f?`<i>${f.hi}° ${Weather.words(f.code).toLowerCase()}${f.rain>=30?`, ${f.rain}% rain`:""}</i>`:""}</div>
        ${sc?`<div class="dk-scent">${sc.row.scent}</div>`:""}
        ${calSplit.notes[ds]?`<div class="dk-also">${calSplit.notes[ds].join(" · ")}</div>`:""}
        <div class="dk-items">${items.slice(0,cap).map(deskRow).join("")}${extra>0?`<div class="dk-more">+${extra} more</div>`:""}</div>
        <div class="dk-lines"></div>
      </div>`;}).join("");
    const carried=slipped.slice(0,5).map(e=>`<div class="dk-it"><span class="dk-ck"></span><span class="dk-tt">${clip(e.title,48)}<i> · ${shortDate(e.date)}</i></span></div>`).join("")
      +(slipped.length>5?`<div class="dk-more">+${slipped.length-5} more in the review</div>`:"");
    $("ed-desk").innerHTML=`
      <header class="dk-head">
        <div class="dk-name">The Sunday Edition<span>Week of ${fmt(start)}${termWeek?" · "+termWeek:""}</span></div>
        <div class="dk-lead"><b>${headline}</b>
          <span>${dues.length} due · ${fmtHours(hrs)} of ${fmtHours(capacity)} free${rest?` · ${fmtHours(rest)} kept for you`:""}${slipped.length?` · ${slipped.length} carried over`:""}</span></div>
      </header>
      <div class="dk-one"><b>This week's one thing</b><span class="dk-blank"></span></div>
      <div class="dk-week">${cols}</div>
      <div class="dk-foot">
        <div class="dk-box"><h4>Carried over</h4>${carried||`<div class="dk-none">Nothing carried over.</div>`}</div>
        <div class="dk-box"><h4>For you this week</h4>${mine.length
          ? mine.slice(0,4).map(e=>`<div class="dk-it"><span class="dk-t">${DAYS[parseISO(e.date).getDay()]}</span><span class="dk-tt">${clip(e.title,44)}</span></div>`).join("")
          : `<div class="dk-none">Nothing booked yet — write one in.</div><div class="dk-lines short"></div>`}</div>
        <div class="dk-box wide"><h4>Write it down</h4><div class="dk-none">Anything that comes up. Sunday's review asks what's here.</div><div class="dk-lines"></div></div>
      </div>
      <div class="dk-colo">Printed ${new Date().toLocaleString([], {weekday:"long", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} · hours are estimates · private areas never print</div>`;
  };
  paintDesk(null);

  /* The forecast last, and never awaited past six seconds (Weather.get's own
     timeout): the paper prints with or without it. */
  const wx=cfg.ears?.weather&&typeof Weather!=="undefined"?await Weather.get(cfg.ears.weather):null;
  if(wx){ paintWeek(wx); paintDesk(wx); }
  document.body.dataset.ready="1";
}catch(err){
  document.getElementById("boot").innerHTML=`<div class="empty">The edition didn't print: ${err.message}</div>`;
  document.body.dataset.ready="1";
}
})();

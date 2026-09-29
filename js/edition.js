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

(async function(){
try{
  const cfg=await j("data/areas.json");
  Nav.render(cfg,"review");
  const state=await j("data/state.json").catch(()=>({done:{}}));
  const done=state.done||{};
  const week=await j("data/week.json").catch(()=>null);
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
      label:e.label||(labels&&e.course&&labels[e.course]?labels[e.course].code:a.name), area:a
    }));
  }))).flat();
  const byId=Object.fromEntries(stored.map(e=>[e.id,e]));

  const cal=cfg.calendar?await j(cfg.calendar).catch(()=>null):null;
  const meetings=(cal?.items||[]).filter(c=>c.date>=start&&c.date<=end).map(c=>({
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
    {n:fmtHours(hrs),label:`of ${fmtHours(capacity)} free`,warn:over||tight},
    {n:slipped.length,label:"carried over",warn:slipped.length>0},
    {n:closed.length,label:"closed last week"},
    {n:someday,label:"on someday"}
  ].map(s=>`<div class="stat${s.warn?" slip":""}"><b>${s.n}</b><span>${s.label}</span></div>`).join("");

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
  const row=e=>`<div class="ed-row ${e.kind}${e.done?" isdone":""}" style="--area:var(${e.area.accent})">
      <span class="ed-t">${e.time?e.time.start:e.kind==="due"?"due":""}</span>
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

  /* The forecast last, and never awaited past six seconds (Weather.get's own
     timeout): the paper prints with or without it. */
  const wx=cfg.ears?.weather&&typeof Weather!=="undefined"?await Weather.get(cfg.ears.weather):null;
  if(wx) paintWeek(wx);
  document.body.dataset.ready="1";
}catch(err){
  document.getElementById("boot").innerHTML=`<div class="empty">The edition didn't print: ${err.message}</div>`;
  document.body.dataset.ready="1";
}
})();

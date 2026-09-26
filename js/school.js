/* De Mott OS · School — renders entirely from data/school/*.json.
   MONTHS / DAYS / $ / iso / TODAY / j() come from js/util.js. */
const KEYCLS={c293:"293",c205:"205",rdev:"rdev",mba:"mba",cap:"cap"};

(async function(){
try{
  const [meta,courses,events,capstone,week,confirm]=await Promise.all(
    ["data/school/meta.json","data/school/courses.json","data/school/events.json","data/school/capstone.json","data/week.json","data/school/confirm.json"].map(j));

  Nav.render(await j("data/areas.json"),"school");

  /* ---------- header ---------- */
  $("eyebrow").textContent=meta.eyebrow;
  $("pagetitle").textContent=meta.title;
  $("pagesub").textContent=meta.sub;
  document.title=meta.title+" · De Mott OS";
  $("statrow").innerHTML=meta.stats.map(s=>
    `<div class="stat"><b>${s.n}</b><span>${s.label}</span></div>`).join("")
    + `<div class="stat flag"><b>16 Sep</b><span>add/drop deadline, 11:59pm</span></div>`;
  $("stamp").textContent="local · "+TODAY;
  $("rebuild").textContent=`${events.length} events loaded from data/school/events.json`;

  /* ---------- pressure strip, computed from events ---------- */
  const wkIndex=ds=>Math.floor(daysBetween(meta.termStart,ds)/7);   // calendar days, DST-proof
  const load={};
  events.forEach(e=>{ if(e.kind!=="due")return; const i=wkIndex(e.date);
    if(i>=0 && e.date<=meta.termEnd) load[i]=(load[i]||0)+(e.weightNum||0); });
  const lastWk=wkIndex(meta.termEnd);
  const nWeeks=Math.min(Math.max(...Object.keys(load).map(Number))+1, lastWk+1);
  const max=Math.max(...Object.values(load),1);
  const nowWk=wkIndex(TODAY);
  let bars="",labs="";
  for(let i=0;i<nWeeks;i++){
    const d=parseISO(addDays(meta.termStart,i*7)), v=load[i]||0;
    const h=Math.max(3,Math.round(v/max*100));
    bars+=`<div class="bar${v>=max*0.7?" hot":""}${i===nowWk?" now":""}" style="height:100%" title="week of ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()} — ${v?v+"% of grades due":"nothing due"}"><i style="height:${h}%"></i></div>`;
    labs+=`<div>${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}</div>`;
  }
  $("load").style.gridTemplateColumns=`repeat(${nWeeks},1fr)`;
  $("loadlabels").style.gridTemplateColumns=`repeat(${nWeeks},1fr)`;
  $("load").innerHTML=bars; $("loadlabels").innerHTML=labs;
  const quiet=[]; for(let i=0;i<nWeeks;i++) if(!load[i]){const d=parseISO(addDays(meta.termStart,i*7));quiet.push(MONTHS[d.getMonth()].slice(0,3)+" "+d.getDate());}
  $("loadkey").innerHTML=`<span><b>No graded work due:</b> weeks of ${quiet.join(", ")}.</span><span><b>Outlined:</b> the current week.</span>`;
  $("hotweeks").innerHTML=meta.hotWeeks.map(w=>`<div class="hw"><h4>${w.head}</h4><p>${w.body}</p></div>`).join("");

  /* ---------- week grid ---------- */
  const px=week.pxPerHour, top=t=>(t-week.startHour)*px, H=(week.endHour-week.startHour)*px;
  let hrs="";
  for(let x=Math.ceil(week.startHour);x<week.endHour;x++)
    hrs+=`<span style="top:${top(x)}px">${x<=12?x:x-12}</span>`;
  let grid=`<div class="hcol">&nbsp;</div>`+week.days.map(d=>`<div class="dcolh">${d}</div>`).join("")
    +`<div class="hours" style="height:${H}px">${hrs}</div>`;
  week.days.forEach((_,di)=>{
    let inner=week.open.filter(o=>o.day===di).map(o=>
      `<div class="open" style="top:${top(o.start)}px;height:${(o.end-o.start)*px}px"><i>${o.label}</i></div>`).join("");
    inner+=week.blocks.filter(b=>b.day===di).map(b=>{
      const cls=b.type==="class"?`cls b${KEYCLS[b.course]}`
              :b.type==="prep" ?`prep p${KEYCLS[b.course]}`
              :b.type==="novin"||b.type==="capstone"?b.type
              :"oh";
      return `<div class="blk ${cls}" style="top:${top(b.start)}px;height:${(b.end-b.start)*px}px"><b>${b.label}</b>${b.sub||""}</div>`;
    }).join("");
    grid+=`<div class="col" style="height:${H}px">${inner}</div>`;
  });
  $("wk").innerHTML=grid;
  $("wk").style.gridTemplateColumns=`44px repeat(${week.days.length},1fr)`;
  $("wknote").innerHTML=`<h4>${week.note.heading}</h4>`+week.note.paras.map(p=>`<p>${p}</p>`).join("");

  /* ---------- master calendar ---------- */
  const order=["c293","c205","rdev","mba","cap"];
  $("filters").innerHTML=order.map(k=>
    `<button class="coursechip" aria-pressed="true" data-course="${k}"><span class="dot" style="background:${courses[k].color}"></span>${courses[k].code}</button>`).join("");

  const byDate={};
  events.forEach(e=>{(byDate[e.date]=byDate[e.date]||[]).push(e);});
  let cal="",curM=null;
  Object.keys(byDate).sort().forEach(ds=>{
    const [Y,M,D]=ds.split("-").map(Number), dt=new Date(Y,M-1,D), mk=Y+"-"+M;
    if(mk!==curM){ if(curM)cal+="</div>"; curM=mk; cal+=`<div class="month"><h3>${MONTHS[M-1]} ${Y}</h3>`; }
    const items=byDate[ds].map(e=>{
      const c=e.course?courses[e.course]:null, k=e.course?"k"+KEYCLS[e.course]:"";
      const t=e.time?`<span class="nt">${e.time.start}–${e.time.end}${e.location?" · "+e.location:""}</span>`:"";
      return `<div class="item ${e.kind} ${k}"${e.course?` data-course="${e.course}"`:""}>`
        +`<span class="tag">${c?c.code:"BERKELEY"}</span>`
        +`<span class="body"><span class="ttl">${e.title}</span>${e.note?`<span class="nt">${e.note}</span>`:""}${t}</span>`
        +(e.weight?`<span class="wt">${e.weight}</span>`:"<span></span>")+`</div>`;
    }).join("");
    cal+=`<div class="day${ds<TODAY?" past":""}${ds===TODAY?" today":""}" data-date="${ds}"><div class="dcol">`
      +`<div class="dnum">${D}</div><div class="dwk">${DAYS[dt.getDay()]}</div></div>`
      +`<div class="items">${items}</div></div>`;
  });
  $("cal").innerHTML=cal+"</div>";

  function applyFilter(){
    const off={};
    document.querySelectorAll(".coursechip").forEach(c=>{ if(c.getAttribute("aria-pressed")==="false") off[c.dataset.course]=1; });
    document.querySelectorAll(".item").forEach(i=>i.classList.toggle("hidden",!!(i.dataset.course&&off[i.dataset.course])));
    document.querySelectorAll(".day").forEach(d=>d.classList.toggle("hidden",!d.querySelector(".item:not(.hidden)")));
    document.querySelectorAll(".month").forEach(m=>m.classList.toggle("hidden",!m.querySelector(".day:not(.hidden)")));
  }
  document.querySelectorAll(".coursechip").forEach(c=>c.addEventListener("click",()=>{
    c.setAttribute("aria-pressed",c.getAttribute("aria-pressed")==="true"?"false":"true"); applyFilter(); }));

  /* ---------- focus on today ----------
     The dock launcher opens the page at #today; this puts the master calendar
     at today's row (or the next dated item, if today is empty) and flashes it. */
  function focusToday(smooth){
    const days=[...document.querySelectorAll("#cal .day")];
    if(!days.length) return;
    const el = days.find(d=>d.dataset.date===TODAY)
            || days.find(d=>d.dataset.date>TODAY)
            || days[days.length-1];
    const y=Math.max(0,el.getBoundingClientRect().top+window.scrollY-80);
    window.scrollTo({top:y,behavior:smooth?"smooth":"auto"});
    days.forEach(d=>d.classList.remove("flash"));
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(()=>el.classList.remove("flash"),2600);
  }
  window.focusToday=focusToday;
  const tb=$("todaybtn");
  if(tb){ tb.hidden=false; tb.addEventListener("click",()=>focusToday(true)); }
  if(/(^|[#&])today\b/.test(location.hash)){
    // Webfonts land after first paint and move everything, and Safari/Chrome will
    // also try to restore the last scroll position — so take the wheel, then re-aim
    // as the layout settles, and stand down the moment James touches anything.
    try{ history.scrollRestoration="manual"; }catch(e){}
    let touched=false;
    ["wheel","touchstart","keydown","mousedown"].forEach(ev=>
      addEventListener(ev,()=>{touched=true;},{once:true,passive:true}));
    const go=()=>{ if(!touched) focusToday(false); };
    requestAnimationFrame(go);
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>setTimeout(go,60));
    addEventListener("load",()=>setTimeout(go,150),{once:true});
    setTimeout(go,700);   // last word, after any late reflow
  }

  /* ---------- course cards ---------- */
  $("courses").innerHTML=["c293","c205","rdev","mba"].map(k=>{
    const c=courses[k], i=c.instructor, m=c.meets;
    const hasPct=c.weights.some(w=>w.pct);
    const rows=c.weights.map(w=>`<tr><td>${w.label}</td><td>${w.value}</td></tr>`).join("");
    const bar=hasPct?`<div class="barline">`+c.weights.map((w,n)=>
      `<i style="width:${w.pct}%;background:${c.color};opacity:${1-n*0.18}"></i>`).join("")+`</div>`:"";
    return `<div class="card k${KEYCLS[k]}"><div class="top">
      <div class="code">${c.code} · ${c.formal} · ${c.units} units${c.grading?" · "+c.grading:""}</div>
      <h3>${c.title}</h3>
      <div class="meta">${m.day} ${m.start}–${m.end} · ${m.room}<br>
        ${i.name} · <em>${i.email}</em>${i.phone?" · "+i.phone:""}<br>
        ${i.gsi?"GSI "+i.gsi+"<br>":""}Office hrs: ${i.officeHours}${i.booking?` · <a href="${i.booking}">book</a>`:""}</div>
      </div>
      <div class="grades"><table>${rows}</table>${bar}</div>
      <div class="policies"><ul>${c.policies.map(p=>`<li>${p}</li>`).join("")}</ul></div></div>`;
  }).join("");

  /* ---------- capstone runway ---------- */
  $("capnote").textContent=capstone.undeclared
    ? "Three tracks, one set of gates. Not declared yet — the committee selection form is due "+capstone.decisionBy.slice(8)+" "+MONTHS[+capstone.decisionBy.slice(5,7)-1]+"."
    : "Declared track shown below.";
  $("captracks").innerHTML=capstone.tracks.map(t=>
    `<div class="card kcap"><div class="top"><div class="code">${t.label}</div><h3>${t.title}</h3>
      <div class="meta">${t.committee}<br><em>${t.sub}</em></div></div>
      <div class="grades"><table>${t.milestones.map(m=>`<tr><td>${m.label}</td><td>${m.date}</td></tr>`).join("")}</table></div>
      <div class="policies"><ul>${t.notes.map(n=>`<li>${n}</li>`).join("")}</ul></div></div>`).join("");

  /* ---------- worth confirming ---------- */
  $("confirm").innerHTML=confirm.map(c=>
    `<div class="cf"><div class="n">${c.tag}</div><p>${c.text}<em>${c.note}</em></p></div>`).join("");

}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't load the data files.</strong><br>${err.message}<br><br>
    ${await bootAdvice()}</div>`;
  console.error(err);
}
})();

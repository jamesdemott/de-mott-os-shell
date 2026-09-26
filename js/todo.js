/* De Mott OS · To-do — everything James added himself, across every area.
   Filters on source:"capture", which serve.py stamps on every write. The bulk
   imports (the 93-row course calendar, the Notion board) are excluded on
   purpose: this is his list, not a firehose of everything with a date. */

const BUCKETS = [
  {id:"overdue", head:"Overdue",     note:"Past its date and not ticked off."},
  {id:"today",   head:"Today",       note:""},
  {id:"week",    head:"Next 7 days", note:""},
  {id:"later",   head:"Later",       note:""},
  {id:"nodate",  head:"No date",     note:"Give one a date and it also shows up in Today and the horizon."},
  {id:"parked",  head:"Someday",     note:"Parked on purpose. The weekly review asks about these, so they can't rot here unseen."},
];

(async function(){
try{
  const cfg=await j("data/areas.json");
  Nav.render(cfg,"todo");

  const state=await j("data/state.json").catch(()=>({done:{}}));
  const doneMap=state.done||{};

  const perArea=await Promise.all(cfg.areas.map(async a=>{
    if(!a.live || !a.feed) return [];
    const raw=await j(a.feed).catch(()=>[]);
    const labels=a.labels ? await j(a.labels).catch(()=>null) : null;
    return raw.filter(e=>e && e.title && e.source==="capture").map(e=>({
      id:e.id, date:e.date||null, title:e.title, kind:e.kind||"", note:e.note||"",
      time:e.time||null, location:e.location||"", weight:e.weight||"",
      repeat:e.repeat||null, status:e.status||"", hours:e.hours!=null?e.hours:null,
      project:e.project||"", added:e.added||null,
      label: e.label || (labels && e.course && labels[e.course] ? labels[e.course].code : a.name),
      area:a
    }));
  }));
  const stored=perArea.flat();

  /* A project can span areas — "move flat" is Admin forms and Life logistics —
     so the rollup here is across all of them, and ?project= narrows to one. */
  const focus=new URLSearchParams(location.search).get("project")||"";
  const projects={};
  stored.filter(e=>e.project&&!doneMap[e.id]&&e.status!=="archived")
        .forEach(e=>{projects[e.project]=(projects[e.project]||0)+1;});

  const archived=stored.filter(e=>e.status==="archived");
  const shown=stored.filter(e=>e.status!=="archived" && (!focus||e.project===focus));
  const items=expand(shown, TODAY, addDays(TODAY,90));
  items.forEach(e=>{ e.done=!!doneMap[e.key]; });

  const open=items.filter(e=>!e.done), closed=items.filter(e=>e.done);
  const week=addDays(TODAY,7);
  const bucketOf=e=>e.status==="someday"?"parked":!e.date?"nodate"
    :e.date<TODAY?"overdue":e.date===TODAY?"today":e.date<=week?"week":"later";
  const overdue=open.filter(e=>bucketOf(e)==="overdue").length;
  const live=open.filter(e=>e.status!=="someday");

  $("statrow").innerHTML=[
    {n:live.length, label:"open"},
    {n:live.filter(e=>!e.date).length, label:"no date yet"},
    {n:open.length-live.length, label:"someday"},
    {n:closed.length, label:"done"}
  ].map(s=>`<div class="stat"><b>${s.n}</b><span>${s.label}</span></div>`).join("")
   + (overdue?`<div class="stat slip"><b>${overdue}</b><span>overdue</span></div>`:"");

  const projNames=Object.keys(projects).sort();
  if(projNames.length){
    $("projbar").hidden=false;
    $("projbar").innerHTML=`<span class="plabel">Projects</span>`
      + projNames.map(n=>`<a class="pchip${n===focus?" on":""}" href="todo.html?project=${encodeURIComponent(n)}">/${n}<b>${projects[n]}</b></a>`).join("")
      + (focus?`<a class="pchip clear" href="todo.html">show everything</a>`:"");
  }

  const when=e=>{
    if(!e.date) return "";
    const t=e.time?` · ${e.time.start}${e.time.end&&e.time.end!==e.time.start?"–"+e.time.end:""}`:"";
    return `${shortDate(e.date)}<i>${relDay(e.date)}</i>${t}`;
  };
  const chips=e=>
      (e.repeat?`<span class="chip rep">↻ ${repeatLabel(e.repeat)}</span>`:"")
    + (e.project&&!focus?`<span class="chip proj">/${e.project}</span>`:"")
    + (e.hours?`<span class="chip hrs">${fmtHours(e.hours)}</span>`:"");
  const row=e=>`<div class="litem ${e.kind}${e.done?" isdone":""}"
      style="--area:var(${e.area.accent});--areabg:var(${e.area.accent}-bg)" data-row="${e.id||""}">
      <span class="tickcell">${Rows.tick(e)}</span>
      <span class="lmain"><span class="ttl">${e.title}</span>${chips(e)}
        <span class="nt"><em class="lareatag">${e.area.name}</em>${e.note?" · "+e.note:""}</span></span>
      <span class="lwhen">${when(e)}</span>
      <span class="lact">${e.date?"":Rows.schedChips(e)}${Rows.editBtn(e)}</span>
    </div>`;

  const grouped={};
  open.forEach(e=>{(grouped[bucketOf(e)]=grouped[bucketOf(e)]||[]).push(e);});
  Object.values(grouped).forEach(g=>g.sort((a,b)=>
    (a.date||"9999")<(b.date||"9999")?-1:(a.date||"9999")>(b.date||"9999")?1:a.title.localeCompare(b.title)));

  $("groups").innerHTML=BUCKETS.filter(b=>grouped[b.id]).map(b=>
    `<section class="lsec ${b.id}">
       <div class="shead"><h2>${b.head} <span class="lcount">${grouped[b.id].length}</span></h2>
         ${b.note?`<p class="note">${b.note}</p>`:""}</div>
       <div class="lgroup">${grouped[b.id].map(row).join("")}</div>
     </section>`).join("")
   || `<div class="empty">Nothing on your list. Add the first thing above — a date is optional.</div>`;

  if(archived.length){
    $("s-archived").hidden=false;
    $("archhead").textContent=`Archived (${archived.length})`;
    $("archlist").innerHTML=archived.map(e=>row({...e,key:e.id,done:!!doneMap[e.id]})).join("");
  }

  if(closed.length){
    $("s-done").hidden=false;
    $("donehead").textContent=`Done (${closed.length})`;
    closed.sort((a,b)=>(b.date||"")<(a.date||"")?-1:1);
    $("donelist").innerHTML=closed.slice(0,30).map(row).join("");
  }

  Rows.items=Object.fromEntries(items.concat(archived).filter(e=>e.id).map(e=>[e.id,e]));
  $("rebuild").textContent=`${stored.length} thing${stored.length===1?"":"s"} you added`
    + (focus?` · showing only /${focus}`:"")
    + ` · imported course rows and the Novin board are not shown here`
    + ` · read live at ${new Date().toLocaleTimeString()}`;

  Rows.cfg=cfg;
  Rows.wire();

}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't load your list.</strong><br>${err.message}<br><br>
    This page reads <code>data/</code> over HTTP — open it via <code>./serve.sh</code> or the dock icon.</div>`;
  console.error(err);
}
})();

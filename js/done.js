/* De Mott OS · Done — the record.
   -------------------------------------------------------------------------
   state.json stamps an ISO time on every tick-off, and until now nothing read
   it back. That made De Mott OS a tool that only ever showed what was left,
   which is a strange way to run a year: the fastest way to notice an area has
   gone silent is to look at what closed in it, and there was nowhere to look.

   Weeks run Monday-first, newest at the top, and each one carries the hours
   its closed work was estimated at — the same estimate the front page
   measures capacity with, so the two numbers are comparable.

   Archived items live here too. They were dropped rather than finished, and
   keeping the two apart matters: one is a week's work, the other is a
   decision not to do something. */

const SHOW_WEEKS = 12;

(async function(){
try{
  const cfg=await j("data/areas.json");
  Nav.render(cfg,"done");
  const state=await j("data/state.json").catch(()=>({done:{}}));
  const done=state.done||{};

  const perArea=await Promise.all(cfg.areas.map(async a=>{
    if(!a.live || !a.feed) return [];
    const raw=await j(a.feed).catch(()=>[]);
    const labels=a.labels ? await j(a.labels).catch(()=>null) : null;
    return raw.filter(e=>e&&e.title).map(e=>({
      id:e.id, date:e.date||null, title:e.title, kind:e.kind||"", note:e.note||"",
      repeat:e.repeat||null, status:e.status||"", hours:e.hours!=null?e.hours:null,
      project:e.project||"", time:e.time||null,
      label: e.label || (labels && e.course && labels[e.course] ? labels[e.course].code : a.name),
      area:a
    }));
  }));
  const stored=perArea.flat();
  const byId=Object.fromEntries(stored.map(e=>[e.id,e]));

  /* A tick whose item is gone — deleted since, or belonging to a feed that no
     longer exists. Counted rather than rendered: the number is honest, and
     inventing a title for it would not be. */
  let orphans=0, prepped=0;
  const closed=Object.entries(done).map(([key,when])=>{
    if(!when) return null;
    // Prep ticks (prep:<class id>) are about getting ready for a class, not a
    // deliverable closing. Counted separately; never an orphan.
    if(String(key).startsWith("prep:")){ prepped++; return null; }
    const [id,occ]=String(key).split("@");
    const item=byId[id];
    if(!item){ orphans++; return null; }
    return {...item, key, date:occ||item.date, closedAt:String(when).slice(0,10)};
  }).filter(Boolean).sort((a,b)=>a.closedAt<b.closedAt?1:a.closedAt>b.closedAt?-1:0);

  const archived=stored.filter(e=>e.status==="archived" && !done[e.id]);

  /* ---------- group into weeks, Monday-first ---------- */
  const mondayOf=ds=>addDays(ds,-((parseISO(ds).getDay()+6)%7));
  const weeks={};
  closed.forEach(e=>{ const w=mondayOf(e.closedAt); (weeks[w]=weeks[w]||[]).push(e); });
  const weekKeys=Object.keys(weeks).sort().reverse().slice(0,SHOW_WEEKS);

  const thisWeek=mondayOf(TODAY);
  const lastWeek=addDays(thisWeek,-7);
  const hoursIn=list=>list.reduce((s,e)=>s+hoursOf(e),0);

  $("statrow").innerHTML=[
    {n:(weeks[thisWeek]||[]).length, label:"closed this week"},
    {n:(weeks[lastWeek]||[]).length, label:"closed last week"},
    {n:closed.length, label:"closed in total"},
    {n:archived.length, label:"archived, never finished"}
  ].map(s=>`<div class="stat"><b>${s.n}</b><span>${s.label}</span></div>`).join("");

  const styleOf=a=>`--area:var(${a.accent});--areabg:var(${a.accent}-bg)`;
  const chips=e=>
      (e.repeat?`<span class="chip rep">↻ ${repeatLabel(e.repeat)}</span>`:"")
    + (e.project?`<span class="chip proj">/${e.project}</span>`:"");

  const row=(e,tail)=>`<div class="rvrow${done[e.key]?" isdone":""}" style="${styleOf(e.area)}" data-row="${e.id}">
      <span class="tickcell">${Rows.tick({...e, done:!!done[e.key]})}</span>
      <span class="rvmain"><span class="ttl">${e.title}</span>${chips(e)}
        <span class="nt"><em class="lareatag">${e.label}</em> · ${tail}</span></span>
      <span class="decide">${Rows.editBtn(e)}</span>
    </div>`;

  const weekName=w=>w===thisWeek?"This week":w===lastWeek?"Last week"
    :`Week of ${shortDate(w)}`;

  $("weeks").innerHTML = weekKeys.length ? weekKeys.map(w=>{
    const items=weeks[w];
    return `<section class="step">
      <div class="shead"><h2>${weekName(w)} <span class="lcount">${items.length}</span></h2>
        <p class="note">${shortDate(w)} – ${shortDate(addDays(w,6))} · about ${fmtHours(hoursIn(items))} of work, by the same estimates the front page counts capacity with.</p></div>
      <div class="rvgroup">${items.map(e=>row(e,`ticked ${shortDate(e.closedAt)}`)).join("")}</div>
    </section>`;}).join("")
    : `<div class="empty">Nothing ticked off yet. This page fills itself in as you use the rest.</div>`;

  if(archived.length){
    $("s-archived").hidden=false;
    $("archhead").textContent=`Archived (${archived.length})`;
    $("archlist").innerHTML=archived.map(e=>
      row({...e,key:e.id}, e.date?`was ${shortDate(e.date)}`:"never scheduled")).join("");
  }

  $("rebuild").textContent=`${closed.length} tick-off${closed.length===1?"":"s"} on record`
    + (weekKeys.length>=SHOW_WEEKS?` · showing the last ${SHOW_WEEKS} weeks`:"")
    + (prepped?` · ${prepped} class prep${prepped===1?"":"s"} ticked off`:"")
    + (orphans?` · ${orphans} tick${orphans===1?"":"s"} belong to items that no longer exist`:"")
    + ` · read live at ${new Date().toLocaleTimeString()}`;

  Rows.cfg=cfg;
  Rows.items=Object.fromEntries(stored.map(e=>[e.id,e]));
  Rows.wire();

}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't build the record.</strong><br>${err.message}<br><br>
    This page reads <code>data/</code> over HTTP — open it via <code>./serve.sh</code> or the dock icon.</div>`;
  console.error(err);
}
})();

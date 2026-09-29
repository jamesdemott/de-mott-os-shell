/* De Mott OS · area list — one page per area, driven by ?area=<id>.
   A running list where a date is optional. Anything dated here flows straight
   into the front page's Today and horizon, because it is the same feed file. */

const BUCKETS = [
  {id:"overdue", head:"Overdue",       note:"Past its date and not ticked off."},
  {id:"today",   head:"Today",         note:""},
  {id:"week",    head:"Next 7 days",   note:""},
  {id:"later",   head:"Later",         note:"Dated, further out."},
  {id:"nodate",  head:"No date",       note:"The running list. Give something a date and it shows up in the day feed."},
  {id:"parked",  head:"Someday",       note:"Parked on purpose — out of the day view until you bring it back. The weekly review asks about these so they can't rot here unseen."},
];

(async function(){
try{
  const want=new URLSearchParams(location.search).get("area")||"admin";
  const cfg=await j("data/areas.json");
  const area=cfg.areas.find(a=>a.id===want);
  if(!area) throw new Error(`no area called “${want}” — check data/areas.json`);
  Nav.render(cfg,area.id);

  const state=await j("data/state.json").catch(()=>({done:{},undo:[]}));
  const done=state.done||{};
  const raw=area.feed ? await j(area.feed).catch(()=>[]) : [];
  const labels=area.labels ? await j(area.labels).catch(()=>null) : null;

  const stored=raw.filter(e=>e&&e.title).map(e=>({
    id:e.id, date:e.date||null, title:e.title, kind:e.kind||"", note:e.note||"",
    weight:e.weight||"", time:e.time||null, location:e.location||"",
    repeat:e.repeat||null, status:e.status||"", hours:e.hours!=null?e.hours:null,
    project:e.project||"", added:e.added||null,
    label: e.label || (labels && e.course && labels[e.course] ? labels[e.course].code : ""),
    area
  }));

  /* One project at a time, when asked: ?area=life&project=kitchen. The whole
     reason to have the field is seeing the pieces of one thing together. */
  const focus=new URLSearchParams(location.search).get("project")||"";
  const projects={};
  stored.filter(e=>e.project&&!done[e.id]&&e.status!=="archived")
        .forEach(e=>{projects[e.project]=(projects[e.project]||0)+1;});

  const archived=stored.filter(e=>e.status==="archived");
  const shown=stored.filter(e=>e.status!=="archived" && (!focus||e.project===focus));

  /* Repeating rules become one row per occurrence, but only across the span
     this page actually shows: a year of a daily habit is not a running list. */
  const items=expand(shown, TODAY, addDays(TODAY,90));
  items.forEach(e=>{ e.done=!!done[e.key]; });

  /* ---------- header ---------- */
  document.title=area.name+" · De Mott OS";
  $("eyebrow").textContent="AREA";
  $("pagetitle").textContent=area.name;
  $("pagesub").innerHTML=area.sub||"";
  $("capinput").placeholder=`add to ${area.name} — “renew renters insurance”, “nov 3 dmv appointment”, “fri 2pm call chase”`;

  const open=items.filter(e=>!e.done), closed=items.filter(e=>e.done);
  const week=addDays(TODAY,7);
  const bucketOf=e=>e.status==="someday"?"parked":!e.date?"nodate"
    :e.date<TODAY?"overdue":e.date===TODAY?"today":e.date<=week?"week":"later";

  const live=open.filter(e=>e.status!=="someday");
  const hrs=live.reduce((s,e)=>s+hoursOf(e),0);
  $("statrow").innerHTML=[
    {n:live.length, label:"open"},
    {n:live.filter(e=>e.date).length, label:"with a date"},
    {n:live.filter(e=>!e.date).length, label:"no date yet"},
    {n:open.length-live.length, label:"someday"},
    {n:closed.length, label:"done"}
  ].map(s=>`<div class="stat"><b>${s.n}</b><span>${s.label}</span></div>`).join("")
   + (hrs&&hoursOn(cfg)?`<div class="stat"><b>${fmtHours(hrs)}</b><span>of work, estimated</span></div>`:"")
   + (open.filter(e=>bucketOf(e)==="overdue").length
      ? `<div class="stat slip"><b>${open.filter(e=>bucketOf(e)==="overdue").length}</b><span>overdue</span></div>` : "");

  /* ---------- projects ---------- */
  const projNames=Object.keys(projects).sort();
  if(projNames.length){
    $("projbar").hidden=false;
    const base=`list.html?area=${area.id}`;
    $("projbar").innerHTML=`<span class="plabel">Projects</span>`
      + projNames.map(n=>`<a class="pchip${n===focus?" on":""}" href="${base}&project=${encodeURIComponent(n)}">/${n}<b>${projects[n]}</b></a>`).join("")
      + (focus?`<a class="pchip clear" href="${base}">show everything</a>`:"");
  }

  /* ---------- rows ---------- */
  const style=`--area:var(${area.accent});--areabg:var(${area.accent}-bg)`;
  const when=e=>{
    if(!e.date) return "";
    const t=e.time?` · ${e.time.start}${e.time.end&&e.time.end!==e.time.start?"–"+e.time.end:""}`:"";
    return `${shortDate(e.date)}<i>${relDay(e.date)}</i>${t}`;
  };
  const chips=e=>
      (e.repeat?`<span class="chip rep">↻ ${repeatLabel(e.repeat)}</span>`:"")
    + (e.project&&!focus?`<span class="chip proj">/${e.project}</span>`:"")
    + (e.hours?`<span class="chip hrs">${fmtHours(e.hours)}</span>`:"");
  const row=e=>`<div class="litem ${e.kind}${e.done?" isdone":""}" style="${style}" data-row="${e.id||""}">
      <span class="tickcell">${Rows.tickable(e)?Rows.tick(e):""}</span>
      <span class="lmain"><span class="ttl">${e.title}</span>${chips(e)}
        ${e.note?`<span class="nt">${e.note}</span>`:""}${e.location?`<span class="nt">${e.location}</span>`:""}</span>
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
   || `<div class="empty">Nothing here yet. Add the first thing above — a date is optional.</div>`;

  if(archived.length){
    $("s-archived").hidden=false;
    $("archhead").textContent=`Archived (${archived.length})`;
    $("archlist").innerHTML=archived.map(e=>row({...e,key:e.id,done:!!done[e.id]})).join("");
  }

  if(closed.length){
    $("s-done").hidden=false;
    $("donehead").textContent=`Done (${closed.length})`;
    closed.sort((a,b)=>(b.date||"")<(a.date||"")?-1:1);
    $("donelist").innerHTML=closed.slice(0,30).map(row).join("");
  }

  /* ---------- a tracker, if this area has one ----------
     A status table, not a to-do list: one row per ongoing thing, each with a
     priority, a status and notes. Undated by nature, so it lives in its own
     file (area.tracks) rather than in the feed, where every row would pile
     into "No date" and the review's undated step. */
  if(area.tracks) await renderTracks(area);

  /* ---------- a synced board, if this area has one ---------- */
  if(area.board){
    const board=await j(area.board).catch(()=>null);
    if(board && board.items && board.items.length){
      $("s-board").hidden=false;
      const active=board.activeStatuses||[];
      const live=board.items.filter(i=>active.includes(i.status));
      $("boardnote").innerHTML=`${board.source} — read-only here. ${live.length} active, `
        + `${board.items.length-live.length} parked. Synced ${board.syncedAt.slice(0,10)}.`;
      const byStatus={};
      live.forEach(i=>{(byStatus[i.status]=byStatus[i.status]||[]).push(i);});
      $("board").innerHTML=`<div class="flightbox" style="${style}"><div class="fgroups">`
        + active.filter(st=>byStatus[st]).map(st=>`<div class="fgroup">
            <div class="fstatus">${st}<span>${byStatus[st].length}</span></div>
            ${byStatus[st].map(i=>`<a class="fitem" href="${i.url}" target="_blank" rel="noopener">
               <span class="ftitle">${i.title}</span>
               ${i.priority?`<span class="fprio p${i.priority.toLowerCase()}">${i.priority}</span>`:""}
               ${i.due?`<span class="fdue${i.due<TODAY?" old":""}">${shortDate(i.due)}</span>`:""}
             </a>`).join("")}
          </div>`).join("")
        + `</div></div>`;
    }
  }

  $("rebuild").textContent=`${stored.length} item${stored.length===1?"":"s"} in `
    + (area.feed||"no feed yet")
    + (focus?` · showing only /${focus}`:"")
    + (archived.length?` · ${archived.length} archived`:"")
    + ` · read live at ${new Date().toLocaleTimeString()}`;

  /* ---------- interaction ---------- */
  Rows.cfg=cfg;
  Rows.items=Object.fromEntries(items.concat(archived).filter(e=>e.id).map(e=>[e.id,e]));
  Rows.captureArea=area.id;           // no @tag needed on an area's own page
  Rows.wire();

}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't load this area.</strong><br>${err.message}<br><br>
    This page reads <code>data/</code> over HTTP — open it via <code>./serve.sh</code> or the dock icon.</div>`;
  console.error(err);
}
})();

async function renderTracks(area){
  const doc=await j(area.tracks).catch(()=>null);
  if(!doc) return;
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const prios=doc.priorities||[], statuses=doc.statuses||[];
  const rank=p=>{const i=prios.indexOf(p); return i<0?prios.length:i;};
  // Priority first, then the order the rows were written in.
  const rows=(doc.items||[]).map((t,i)=>({...t,_i:i}))
    .sort((a,b)=>rank(a.priority)-rank(b.priority)||a._i-b._i);
  const byId=Object.fromEntries(rows.map(t=>[t.id,t]));
  const slug=v=>String(v||"").toLowerCase().replace(/[^a-z]+/g,"-").replace(/^-|-$/g,"");

  $("s-tracks").hidden=false;
  $("s-tracks").style.setProperty("--area",`var(${area.accent})`);
  $("s-tracks").style.setProperty("--areabg",`var(${area.accent}-bg)`);
  $("tracknote").textContent=`${rows.length} tracked · ${rows.filter(t=>t.status===statuses[0]).length} not started.`
    + (area.private?" Stays on this Mac.":"");

  $("tracks").innerHTML=`<thead><tr><th>What</th><th>Priority</th><th>Status</th>
      <th>Notes</th><th>Raise at next visit</th><th></th></tr></thead><tbody>`
    + rows.map(t=>`<tr data-track="${esc(t.id)}">
        <td class="tname">${esc(t.title)}</td>
        <td>${t.priority?`<span class="tprio p-${slug(t.priority)}">${esc(t.priority)}</span>`:""}</td>
        <td>${t.status?`<span class="tstat s-${slug(t.status)}">${esc(t.status)}</span>`:""}</td>
        <td class="ttext">${esc(t.note)}</td>
        <td class="ttext">${esc(t.raise)}</td>
        <td class="tact"><button class="mini" data-tedit="${esc(t.id)}" aria-label="edit">⋯</button></td>
      </tr>`).join("")
    + `</tbody>`;

  const close=()=>document.querySelectorAll("tr.tedit").forEach(n=>n.remove());
  const editor=(t, after)=>{
    close();
    const opt=(list,cur)=>[""].concat(list).map(v=>
      `<option value="${esc(v)}"${v===(cur||"")?" selected":""}>${v?esc(v):"—"}</option>`).join("");
    const tr=document.createElement("tr");
    tr.className="tedit";
    tr.innerHTML=`<td colspan="6"><div class="editor">
        <label>what<input type="text" id="tr-title" value="${esc(t.title)}"></label>
        <label>priority<select id="tr-prio">${opt(prios,t.priority)}</select></label>
        <label>status<select id="tr-stat">${opt(statuses,t.status)}</select></label>
        <label class="wide">notes<input type="text" id="tr-note" value="${esc(t.note)}"></label>
        <label class="wide">raise at next visit<input type="text" id="tr-raise" value="${esc(t.raise)}"></label>
        <div class="edrow"><span class="edquick"></span>
          ${t.id?`<button class="mini danger" id="tr-del">remove</button>`:""}
          <button class="mini" id="tr-cancel">cancel</button>
          <button class="mini go" id="tr-save">save</button></div>
      </div></td>`;
    if(after) after.after(tr); else $("tracks").querySelector("tbody").append(tr);
    const val=id=>document.getElementById(id).value;
    document.getElementById("tr-title").focus();
    const save=async()=>{
      const item={id:t.id||"", title:val("tr-title"), priority:val("tr-prio"),
                  status:val("tr-stat"), note:val("tr-note"), raise:val("tr-raise")};
      if(!item.title.trim()) return Rows.toast("Needs a name");
      try{ await post("/api/track/save",{area:area.id,item}); location.reload(); }
      catch(err){ Rows.toast("Couldn't save: "+err.message); }
    };
    document.getElementById("tr-save").onclick=save;
    document.getElementById("tr-cancel").onclick=close;
    tr.addEventListener("keydown",ev=>{
      if(ev.key==="Enter"){ ev.preventDefault(); save(); }
      if(ev.key==="Escape") close();
    });
    const del=document.getElementById("tr-del");
    if(del) del.onclick=async()=>{
      try{
        await post("/api/track/delete",{area:area.id,id:t.id});
        tr.previousElementSibling?.remove(); tr.remove();
        Rows.offerUndo("Removed "+esc(t.title));
      }catch(err){ Rows.toast("Couldn't remove: "+err.message); }
    };
  };

  $("tracks").addEventListener("click",ev=>{
    const b=ev.target.closest("[data-tedit]");
    if(!b) return;
    const row=b.closest("tr");
    if(row.nextElementSibling?.classList.contains("tedit")) return close();
    editor(byId[b.dataset.tedit], row);
  });
  $("trackadd").onclick=()=>editor({title:"",priority:"",status:statuses[0]||""}, null);
}

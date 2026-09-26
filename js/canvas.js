/* De Mott OS · course files — what's filed, and the Pull Canvas handoff.

   Reads data/school/canvas.json for the course list and data/school/canvas_pull.json
   for the last pull. Course labels come from courses.json, so a course is always
   "RDEV 200 Construction", never a bare number.

   A pull happens in two halves, and the split is per course, from `apiFiles` in
   canvas.json:

     API      CP 293, CP 205, RDEV 200   sync_canvas.py, and cron can run it
     Chrome   MBA 282                    Files 403, Pages disabled, Study.Net

   The original note here said there was no API route to bCourses at all. There
   is — it answers 401, meaning it just wants a token. So the button now runs the
   API half itself (via /api/canvas/sync, localhost only) and only hands off for
   the courses the API genuinely cannot reach. */

(async function(){
  const panel = $("canvaspanel");
  if(!panel) return;

  const post = async (path, body) => {
    const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"},
                                body: JSON.stringify(body||{})});
    const out = await r.json().catch(()=>({error:"the server didn't answer with JSON"}));
    if(!r.ok || out.error) throw new Error(out.error || ("HTTP "+r.status));
    return out;
  };

  let cfg, labels, pull=null;
  try{
    [cfg, labels] = await Promise.all([j("data/school/canvas.json"), j("data/school/courses.json")]);
  }catch(err){
    return;                       // no canvas config — the section stays hidden
  }
  try{ pull = await j("data/school/canvas_pull.json"); }catch(e){ pull=null; }

  const name = cid => (labels[cid] && labels[cid].code) || cid;

  /* Inventory on load rather than showing stale counts. It only reads the
     Berkeley folder and rewrites one gitignored file, so it's cheap to redo. */
  // A network failure means the server is down. Anything else is the server
  // answering with an error, e.g. macOS refusing it the iCloud folder, and
  // saying "the server isn't answering" then sent people looking in the wrong place.
  let inv=null, offline=false, scanError="";
  // macOS refuses this app iCloud Drive. That's not a fault to report, it's a
  // different route: the .command wrapper runs as Terminal, which is allowed.
  try{ inv = (await post("/api/canvas/scan")).inventory; }
  catch(err){ if(err instanceof TypeError) offline = true; else scanError = err.message; }

  const apiCourses     = Object.keys(cfg.courses).filter(c => cfg.courses[c].apiFiles !== false);
  const browserCourses = Object.keys(cfg.courses).filter(c => cfg.courses[c].apiFiles === false);

  function render(status){
    const blocked = /not permitted/i.test(scanError);
    const last = pull && pull.last;
    const courses = Object.keys(cfg.courses);

    const counts = courses.map(cid=>{
      const c = inv && inv.courses[cid];
      const n = c ? c.count : "–";
      const missing = c && !c.exists;
      const viaBrowser = cfg.courses[cid].apiFiles === false;
      return `<div class="cvcourse${missing?" gone":""}${viaBrowser?" browseronly":""}"
                   title="${viaBrowser ? "not reachable over the API — needs Chrome" : "pulls automatically"}">
                <b>${n}</b><span>${name(cid)}${viaBrowser?" ⌘":""}</span>
              </div>`;
    }).join("");

    const filed = last && last.filed && last.filed.length;
    const checked = pull && pull.lastChecked;
    const lastLine = (!last
      ? "No pull yet."
      : `Last pull ${relDay(last.pulledAt.slice(0,10))} · `
        + (filed ? `${filed} new file${filed===1?"":"s"} filed` : "nothing new"))
      + (checked ? ` · checked ${hoursSince(checked) < 1 ? "just now" : relDay(checked.slice(0,10))}` : "");

    panel.innerHTML = `
      <div class="cvtop">
        <div>
          <div class="cvtitle">Course files</div>
          <div class="cvsub">${inv ? `${inv.total} filed across ${courses.length} courses` : "not scanned"}
            · <span class="cvlast">${lastLine}</span></div>
        </div>
        ${blocked ? "" : `<button type="button" id="cvbtn" ${offline?"disabled":""}>Pull Canvas</button>`}
      </div>
      <div class="cvcourses">${counts}</div>
      ${status || offline || scanError ? `<div class="cvnote" id="cvnote">${status || (offline
        ? `The server isn't answering — open this through <code>./serve.sh</code> or the dock icon.`
        : blocked
          ? `<b>Pull from the Finder, not here.</b> macOS won't let this app read iCloud Drive
             (see CLAUDE.md — four ways were tried), so double-click
             <code>Pull Canvas.command</code> in the De Mott OS folder. It does the same pull.`
          : `<b>Couldn't scan the course folders.</b> ${esc(scanError)}`)}</div>` : ""}`;
    /* The standing explanation lives in a tooltip now: the panel sits beside the
       page header and has to stay compact. Pull output still gets the full note. */
    panel.title = `Pulls ${apiCourses.map(name).join(", ")} straight from the bCourses API — read only, nothing is ever submitted.`
      + (browserCourses.length ? ` ${browserCourses.map(name).join(", ")} can't be reached that way; say "pull canvas" to Claude for that one.` : "");

    const btn = $("cvbtn");
    if(btn) btn.addEventListener("click", pullCanvas);
  }

  /* Two presses on purpose: the first shows what would land, the second does it.
     Downloading into iCloud without showing him the list first would be rude. */
  let staged = null;

  /* Check when he opens De Mott OS, not on a timer — nothing runs while he
     isn't looking, and what he sees is current. Throttled by checkEveryHours
     (default 24) using a server-side stamp, so refreshing the page ten times
     doesn't hit bCourses ten times. It only ever looks: filing stays a press,
     unless canvas.json says autoFile. */
  function hoursSince(iso){
    if(!iso) return Infinity;
    return (Date.now() - new Date(iso).getTime()) / 3600000;
  }

  async function checkOnOpen(){
    const every = cfg.checkEveryHours;
    if(!every || offline) return;
    if(hoursSince(pull && pull.lastChecked) < every) return;
    try{
      const r = await post("/api/canvas/sync", {mode: cfg.autoFile ? "pull" : "dry"});
      if(r.needsToken) return;                       // don't nag on every load
      pull = await j("data/school/canvas_pull.json").catch(()=>pull);
      if(!r.newCount) { render(); return; }          // nothing new, stay quiet
      if(cfg.autoFile){
        inv = (await post("/api/canvas/scan")).inventory;
        render(`<b>Filed ${r.newCount} new file${r.newCount===1?"":"s"} just now.</b>
          <pre class="cvout">${esc(r.output)}</pre>`);
        return;
      }
      staged = r.output;
      render(`<b>${r.newCount} new file${r.newCount===1?"":"s"} on bCourses.</b>
        <pre class="cvout">${esc(r.output)}</pre>`);
      const b = $("cvbtn");
      if(b){ b.textContent = "Download these"; b.classList.add("armed"); }
    }catch(err){ /* a failed background check should never break the page */ }
  }

  async function pullCanvas(){
    const btn = $("cvbtn");
    btn.disabled = true;
    try{
      if(!staged){
        btn.textContent = "Checking…";
        inv = (await post("/api/canvas/scan")).inventory;
        const r = await post("/api/canvas/sync", {mode:"dry"});
        if(r.needsToken){
          render(`<b>No Canvas token yet.</b> Double-click
            <code>Set Canvas Token.command</code> in this folder — it asks for the
            token without showing it on screen.`);
          btn.disabled = false; btn.textContent = "Pull Canvas"; return;
        }
        if(r.newCount === 0){
          // nothing to fetch — don't arm a second press that would do nothing
          render(`<b>Nothing new.</b><pre class="cvout">${esc(r.output)}</pre>`);
          const b0 = $("cvbtn");
          if(b0){ b0.disabled = false; b0.textContent = "Pull Canvas"; }
          return;
        }
        staged = r.output;
        render(`<b>What's new</b><pre class="cvout">${esc(r.output)}</pre>
          Press again to download and file it.`);
        // render() rebuilds the panel, so the old button node is detached now
        const b = $("cvbtn");
        if(b){ b.disabled = false; b.textContent = "Download these"; b.classList.add("armed"); }
        return;
      }
      btn.textContent = "Pulling…";
      const r = await post("/api/canvas/sync", {mode:"pull"});
      staged = null;
      pull = await j("data/school/canvas_pull.json").catch(()=>pull);
      inv  = (await post("/api/canvas/scan")).inventory;
      render(`<b>${r.ok ? "Done" : "Finished with problems"}</b><pre class="cvout">${esc(r.output)}</pre>`);
      $("cvbtn").classList.remove("armed");
      $("cvbtn").textContent = "Pull Canvas";
      $("cvbtn").disabled = false;
    }catch(err){
      staged = null;
      render(`<b>That didn't work.</b> ${esc(err.message)}`);
      const b = $("cvbtn");
      if(b){ b.disabled = false; b.textContent = "Pull Canvas"; }
    }
  }

  /* script output goes into the page, so escape it */
  function esc(t){
    return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  render();
  $("s-canvas").hidden = false;
  checkOnOpen();          // fire and forget; the panel updates itself
})();

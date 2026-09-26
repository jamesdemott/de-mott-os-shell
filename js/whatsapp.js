/* De Mott OS · what you missed on WhatsApp — read only, and deliberately inert.

   Reads data/whatsapp/digest.json, written by sync_whatsapp.py from the Mac
   app's own message store. Nothing here can send a message, mark anything read,
   or change anything on WhatsApp's side; the script it calls can't either.

   Two things this panel deliberately does NOT do:

   · It never creates items. A digest that quietly turned "we should get dinner
     sometime" into a to-do would poison the one list James actually trusts, and
     a list you learn to scroll past is worse than no page at all. It shows what
     was said; capture is still a decision he makes, in the capture bar.
   · It never marks anything read. The digest is a second view of the backlog,
     not a replacement for WhatsApp — if reading the summary silently cleared
     the unread badge, the real app would start lying to him.

   It checks on open rather than on a timer, the same as Pull Canvas and for the
   same reason James gave there: nothing runs while he isn't looking, and what he
   sees when he looks is current. */

(async function(){
  const panel = $("wapanel");
  if(!panel) return;
  const sec = $("s-whatsapp");

  const post = async (path, body) => {
    const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"},
                                 body: JSON.stringify(body||{})});
    const out = await r.json().catch(()=>({error:"the server didn't answer with JSON"}));
    if(!r.ok || out.error) throw new Error(out.error || ("HTTP "+r.status));
    return out;
  };

  const esc = s => String(s==null?"":s).replace(/[&<>"]/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  // Hours since an ISO stamp, or Infinity if there has never been one.
  const hoursSince = t => t ? (Date.now() - new Date(t)) / 36e5 : Infinity;
  const agoWords = t => {
    const h = hoursSince(t);
    if(h === Infinity) return "never";
    if(h < 1)  return "just now";
    if(h < 24) return Math.round(h) + "h ago";
    return Math.round(h/24) + "d ago";
  };

  let digest = null, cfg = null, blocked = false, seen = {}, showRead = false;

  async function load(){
    // Both are gitignored and may simply not exist yet — a missing file is a
    // normal first-run state, not an error worth showing.
    digest = await j("data/whatsapp/digest.json").catch(()=>null);
    cfg    = await j("data/whatsapp/config.json").catch(()=>null);
    seen   = await j("data/whatsapp/seen.json").catch(()=>({})) || {};
  }

  // Everything that wants a reply gets its own line, capped so the box-out
  // can't out-run the day view beside it — that length is why this stopped
  // being a full-width section. When nothing needs him, show the busiest few
  // rather than an almost-empty card.
  const CAP = 5;

  // A group counts as read while its mark is at or past its newest kept
  // message. Comparing timestamps rather than storing a flag is what lets a
  // dismissed group come back on its own when something new actually lands.
  const isRead = g => !!(seen[g.name] && g.latest && seen[g.name] >= g.latest);

  function row(g){
    const head = g.headline || g.summary || "";
    const read = isRead(g);
    return `<div class="warow${read?" isread":""}" data-group="${esc(g.name)}"
                 title="${esc(g.summary || head)}">
      <button class="watick${read?" on":""}" data-group="${esc(g.name)}"
              aria-pressed="${read}"
              title="${read?"Mark unread":"Mark read and hide"}">\u2713</button>
      <b>${g.messages.length || "\u2013"}</b>
      <span class="waname">${esc(g.name)}</span>
      <span class="wasay">${esc(head)}</span>
    </div>`;
  }

  // Ticking is optimistic: the row goes straight away and the write follows.
  // A dismissal that waits on the network feels broken at this size.
  panel.addEventListener("click", async e => {
    const btn = e.target.closest(".watick");
    if(!btn) return;
    const name = btn.dataset.group;
    const g = (digest.groups || []).find(x => x.name === name);
    if(!g) return;
    const nowRead = !isRead(g);
    if(nowRead) seen[name] = g.latest || new Date().toISOString().slice(0,19);
    else delete seen[name];
    render();
    try{
      await post("/api/whatsapp/seen", {group: name, at: nowRead ? seen[name] : null});
    }catch(err){
      // Put it back rather than showing a state the server does not have.
      if(nowRead) delete seen[name]; else seen[name] = g.latest;
      render();
    }
  });

  function render(){
    // Groups that want something from him first, then by how much there is to
    // read. Ranking on volume alone put "nothing needs your attention here" in
    // a top slot while a quiet group asking him a direct question folded away.
    const groups = (digest && digest.groups || [])
      .filter(g => g.messages.length)
      .sort((a,b) => (b.needsYou === true) - (a.needsYou === true)
                  || b.messages.length - a.messages.length);
    if(!groups.length){ sec.hidden = true; return; }

    const t = digest.totals || {};
    const kept = t.kept || groups.reduce((n,g) => n + g.messages.length, 0);
    // Read groups drop out of the ranking entirely — that is the point of
    // ticking one — but they stay counted so a pile can't build up unseen.
    const live = showRead ? groups : groups.filter(g => !isRead(g));
    const nRead = groups.length - groups.filter(g => !isRead(g)).length;
    if(!live.length && !nRead){ sec.hidden = true; return; }
    const needs = live.filter(g => g.needsYou === true);
    const shown = (needs.length ? needs : live).slice(0, CAP);
    const rest  = live.filter(g => shown.indexOf(g) < 0);

    const notes = [];
    if(nRead) notes.push(`<button class="walink" id="watoggle">${
      showRead ? "hide" : "show"} ${nRead} read</button>`);
    if(blocked) notes.push(`<span class="waflag">can\u2019t refresh \u2014 run \u201cWhatsApp Digest.command\u201d</span>`);
    else if(digest.needsKey) notes.push(`<span class="waflag">no API key, so no summaries</span>`);
    if(cfg && !(cfg.phone||"").trim())
      notes.push(`<span class="waflag">@-mentions not detected</span>`);

    panel.innerHTML = `
      <div class="watop">
        <div>
          <div class="watitle">Missed on WhatsApp</div>
          <div class="wasub">${groups.length} group${groups.length===1?"":"s"} \u00b7
            ${kept} worth reading \u00b7 <span class="waage">read ${agoWords(digest.syncedAt)}</span></div>
        </div>
      </div>
      ${shown.length ? shown.map(row).join("")
        : `<p class="waclear">All caught up.</p>`}
      ${rest.length ? `<details class="wamore">
          <summary>${rest.length} quieter group${rest.length===1?"":"s"}</summary>
          ${rest.map(row).join("")}</details>` : ""}
      ${notes.length ? `<p class="wafoot">${notes.join(" \u00b7 ")}</p>` : ""}`;
    const t2 = $("watoggle");
    if(t2) t2.onclick = () => { showRead = !showRead; render(); };
    sec.hidden = false;
  }

  async function checkOnOpen(){
    const every = (cfg && cfg.checkEveryHours) || 6;
    if(hoursSince(digest && digest.syncedAt) < every) return;
    try{
      // `full` summarises; the server refuses it politely when there's no key,
      // and the digest still arrives as the filtered list.
      const r = await post("/api/whatsapp/sync", {mode: "full"});
      // macOS refuses this server the WhatsApp store. Keep whatever digest the
      // .command wrapper last wrote and explain the split, rather than wiping
      // the panel over a permission we already know we don't have.
      blocked = !!r.blocked;
      await load();
      render();
    }catch(err){
      /* A failed background read must never break the front page or nag on
         every load — the same rule the Canvas check follows. The status strip
         is where a digest that stopped working becomes visible. */
    }
  }

  await load();
  render();
  checkOnOpen();          // fire and forget; the panel updates itself
})();

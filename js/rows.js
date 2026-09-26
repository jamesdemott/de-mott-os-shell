/* De Mott OS — shared row chrome: ticking, the inline editor, capture, toasts.
   Used by the front page and by every area list page, so the two can't drift.

   A page sets up state, then calls Rows.wire():

       Rows.cfg    = <data/areas.json>
       Rows.items  = { id: item }         every item the page rendered
       Rows.areaOf = id => areaObject     for accent colours
       Rows.captureArea = "admin"|null    default area for the capture bar
       Rows.wire()

   Item markup helpers (Rows.tick / Rows.editBtn) keep the row shape identical
   across pages. Only locally-owned items — ones with an id in an area that has
   a feed — are editable; Novin's board is synced from Notion and read-only. */

const Rows = {
  cfg: null,
  items: {},
  captureArea: null,

  /* ---- identity ---- */
  own(e){ return !!e.id && !!e.area.feed; },
  /* A lecture is attendance, not a task. A synced board row belongs to Notion,
     so ticking it here would only diverge from the source. */
  tickable(e){ return e.kind !== "class" && !e.readonly; },

  /* data-key is what gets ticked, and it is NOT always the item id: one
     occurrence of a repeating item is keyed id@YYYY-MM-DD, so ticking this
     Monday's standup doesn't tick every Monday's. Pages set `key` via
     expand(); anything that didn't go through it falls back to the id. */
  tick(e){
    const k = e.key || e.id;
    return e.done
      ? `<button class="tick on" data-key="${k}" aria-pressed="true" title="tick off">✓</button>`
      : `<button class="tick" data-key="${k}" aria-pressed="false" title="tick off"></button>`;
  },
  editBtn(e){
    return this.own(e)
      ? `<button class="editbtn" data-area="${e.area.id}" data-id="${e.id}" title="edit, reschedule or delete">⋯</button>`
      : "";
  },
  schedChips(e){
    return this.own(e) ? `<button class="mini" data-sched="today" data-area="${e.area.id}" data-id="${e.id}">today</button>
      <button class="mini" data-sched="tomorrow" data-area="${e.area.id}" data-id="${e.id}">tmrw</button>
      <button class="mini" data-sched="week" data-area="${e.area.id}" data-id="${e.id}">+1w</button>` : "";
  },

  /* ---- toast ---- */
  _timer: null,
  toast(html, ms = 6000){
    const t = document.getElementById("toast");
    if(!t) return;
    t.innerHTML = html; t.hidden = false;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { t.hidden = true; }, ms);
  },
  /* Undo pops serve.py's stack, which is on the Mac. Queued from a phone there
     is nothing yet to pop — the op is still a file in the outbox — so the
     toast says what happened and offers no button it cannot honour. Undo comes
     back the moment the Mac drains it, as an ordinary entry on the real stack. */
  async offerUndo(what){
    if((await dataSource()).mode !== "local")
      return this.toast(`${what} · queued for your Mac`);
    this.toast(`${what} · <button class="tlink" id="undobtn">undo</button>`);
    const b = document.getElementById("undobtn");
    if(!b) return;
    b.addEventListener("click", async () => {
      try{
        const r = await post("/api/undo", {});
        this.toast("Undone — " + r.undone, 2500);
        setTimeout(() => location.reload(), 600);
      }catch(err){ this.toast("Couldn't undo: " + err.message); }
    });
  },

  /* ---- editor ---- */
  closeEditor(){ document.querySelectorAll(".editor").forEach(n => n.remove()); },

  openEditor(btn){
    const { area, id } = btn.dataset, e = this.items[id];
    if(!e) return;
    const row = btn.closest(".row,.hitem,.litem");
    if(row.nextElementSibling?.classList.contains("editor")){ return this.closeEditor(); }
    this.closeEditor();

    /* An occurrence of a repeating item edits the SERIES, and the date field
       must show the date the rule repeats from — not whichever occurrence
       happened to be on screen, which would silently drag the whole series. */
    const anchor = e.anchor || e.date || "";

    /* The select can only express the common rules. Anything richer — "every
       Mon and Thu", "every 3 weeks" — is preserved as a "leave as it is"
       option rather than being flattened into something it isn't. */
    const R = e.repeat, rn = R?.n || 1;
    const simple = !R ? ""
      : R.every === "week" && !R.on && rn === 1 ? "week"
      : R.every === "week" && !R.on && rn === 2 ? "week2"
      : R.every === "day" && rn === 1 ? "day"
      : R.every === "month" && rn === 1 ? "month"
      : R.every === "year" && rn === 1 ? "year"
      : "keep";
    const opts = [["", "doesn't repeat"], ["day", "every day"], ["week", "every week"],
                  ["week2", "every 2 weeks"], ["month", "every month"], ["year", "every year"]];
    if(simple === "keep") opts.unshift(["keep", repeatLabel(R) + " (leave as it is)"]);

    const panel = document.createElement("div");
    panel.className = "editor";
    panel.style.setProperty("--area", `var(${e.area.accent})`);
    panel.innerHTML = `
      ${e.occ ? `<div class="ednote wide">Editing <b>the whole series</b> — every ${repeatLabel(R)}. Ticking off one day only affects that day.</div>` : ""}
      <label>title<input type="text" id="ed-title" value="${e.title.replace(/"/g, "&quot;")}"></label>
      <label>${e.occ ? "repeats from" : "date"}<input type="date" id="ed-date" value="${anchor}"></label>
      <label>from<input type="time" id="ed-start" value="${e.time?.start || ""}"></label>
      <label>to<input type="time" id="ed-end" value="${e.time?.end || ""}"></label>
      <label class="wide">note<input type="text" id="ed-note" value="${(e.note || "").replace(/"/g, "&quot;")}"></label>
      <label>repeat<select id="ed-repeat">${opts.map(([v, t]) =>
        `<option value="${v}"${v === simple ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>hours<input type="number" id="ed-hours" min="0" max="200" step="0.25"
        placeholder="${fmtHours(hoursOf(e))} est." value="${e.hours != null ? e.hours : ""}"></label>
      <label>project<input type="text" id="ed-project" value="${(e.project || "").replace(/"/g, "&quot;")}"></label>
      <div class="edrow">
        <span class="edquick">
          <button class="mini" data-shift="1">+1 day</button>
          <button class="mini" data-shift="7">+1 week</button>
          <button class="mini" data-clear="1">unschedule</button>
          ${e.status === "someday"
            ? `<button class="mini" data-status="">back to active</button>`
            : `<button class="mini" data-status="someday">someday</button>`}
          ${e.status === "archived"
            ? `<button class="mini" data-status="">unarchive</button>`
            : `<button class="mini" data-status="archived">archive</button>`}
        </span>
        <button class="mini danger" id="ed-del">delete</button>
        <button class="mini go" id="ed-save">save</button>
      </div>`;
    row.after(panel);
    document.getElementById("ed-title").focus();

    const send = async patch => {
      try{ await post("/api/update", { area, id, patch }); location.reload(); }
      catch(err){ this.toast("Couldn't save: " + err.message); }
    };
    panel.querySelectorAll("[data-shift]").forEach(b => b.addEventListener("click", ev => {
      ev.preventDefault();
      send({ date: addDays(anchor || TODAY, +b.dataset.shift) });
    }));
    panel.querySelector("[data-clear]").addEventListener("click", ev => {
      ev.preventDefault(); send({ date: null, repeat: null });   // a rule with no date is meaningless
    });
    /* Parking clears the date: something on the someday list isn't scheduled,
       and leaving a stale date on it would put it straight back in Slipped
       the moment it came off the list. */
    panel.querySelectorAll("[data-status]").forEach(b => b.addEventListener("click", ev => {
      ev.preventDefault();
      const want = b.dataset.status;
      send(want === "someday" ? { status: "someday", date: null, repeat: null } : { status: want });
    }));
    document.getElementById("ed-save").addEventListener("click", ev => {
      ev.preventDefault();
      const t = document.getElementById("ed-title").value.trim();
      if(!t) return this.toast("Needs a title");
      const st = document.getElementById("ed-start").value;
      const en = document.getElementById("ed-end").value;
      const rv = document.getElementById("ed-repeat").value;
      const hv = document.getElementById("ed-hours").value.trim();
      const date = document.getElementById("ed-date").value || null;
      const patch = {
        title: t,
        date,
        note: document.getElementById("ed-note").value.trim() || null,
        time: st ? { start: st, end: en || st } : null,
        hours: hv === "" ? null : Number(hv),
        project: document.getElementById("ed-project").value.trim() || null
      };
      // "keep" means the rule is richer than the select can express — say
      // nothing about repeat rather than flattening it on the way past.
      if(rv !== "keep"){
        patch.repeat = !rv || !date ? null
          : rv === "week2" ? { every: "week", n: 2 } : { every: rv };
      }
      send(patch);
    });
    document.getElementById("ed-del").addEventListener("click", async ev => {
      ev.preventDefault();
      try{
        const r = await post("/api/delete", { area, id });
        this.offerUndo(`Deleted “${r.deleted}”`);
        setTimeout(() => location.reload(), 700);
      }catch(err){ this.toast("Couldn't delete: " + err.message); }
    });
    panel.addEventListener("keydown", ev => {
      if(ev.key === "Enter"){ ev.preventDefault(); document.getElementById("ed-save").click(); }
      if(ev.key === "Escape"){ this.closeEditor(); }
    });
  },

  /* ---- the stamp ----
     Ticking something off lands a rubber stamp on the row, which then fades.
     The one bit of ceremony on the site, and it is on the action worth
     repeating. Words are newsroom slang for finished — "put to bed" is what
     a paper says when the edition has gone to press. Reduced motion skips it:
     the strike-through already says done. */
  STAMPS: ["Filed", "Done", "Put to bed", "Printed", "Signed off", "Closed"],
  stamp(btn){
    const row = btn.closest(".row,.hitem,.litem,.rvrow");
    if(!row || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    row.querySelector(".stamp")?.remove();
    const s = document.createElement("span");
    s.className = "stamp";
    s.setAttribute("aria-hidden", "true");
    s.textContent = this.STAMPS[Math.floor(Math.random() * this.STAMPS.length)];
    s.style.setProperty("--tilt", (-4 - Math.random() * 7).toFixed(1) + "deg");
    row.appendChild(s);
    s.addEventListener("animationend", () => s.remove());
  },

  /* ---- wiring ---- */
  wire(){
    /* tick off — optimistic, so it feels instant; reverts if the write fails */
    document.addEventListener("click", async ev => {
      const btn = ev.target.closest(".tick");
      if(!btn) return;
      const key = btn.dataset.key, next = btn.getAttribute("aria-pressed") !== "true";
      const paint = on => document.querySelectorAll(`.tick[data-key="${CSS.escape(key)}"]`).forEach(b => {
        b.setAttribute("aria-pressed", String(on));
        b.classList.toggle("on", on); b.textContent = on ? "✓" : "";
        b.closest(".row,.hitem,.litem")?.classList.toggle("isdone", on);
      });
      paint(next);
      if(next) this.stamp(btn);
      try{ await post("/api/done", { id: key, done: next }); }
      catch(err){ paint(!next); this.toast("Couldn't save that: " + err.message); }
    });

    document.addEventListener("click", async ev => {
      const edit = ev.target.closest(".editbtn");
      if(edit){ ev.preventDefault(); return this.openEditor(edit); }
      const sched = ev.target.closest("[data-sched]");
      if(sched){
        ev.preventDefault();
        const w = sched.dataset.sched;
        const date = w === "today" ? TODAY : w === "tomorrow" ? addDays(TODAY, 1) : addDays(TODAY, 7);
        try{ await post("/api/update", { area: sched.dataset.area, id: sched.dataset.id, patch: { date } }); location.reload(); }
        catch(err){ this.toast("Couldn't reschedule: " + err.message); }
      }
    });

    this.wireCapture();
  },

  wireCapture(){
    const input = document.getElementById("capinput");
    const preview = document.getElementById("cappreview");
    const form = document.getElementById("capform");
    const btn = document.getElementById("capbtn");
    if(!input || !form) return;

    const cfg = this.cfg;
    const index = {}; cfg.areas.forEach(a => index[a.id] = { id: a.id, name: a.name });
    const fallback = this.captureArea || cfg.defaultCaptureArea || "admin";

    const repaint = () => {
      const v = input.value.trim();
      if(!v){ preview.className = "cappreview"; preview.innerHTML = ""; return null; }
      const p = parseCapture(v, TODAY, index, fallback);
      if(p.error){ preview.className = "cappreview bad"; preview.textContent = p.error; return null; }
      const a = cfg.areas.find(x => x.id === p.area);
      preview.className = "cappreview good";
      preview.style.setProperty("--area", `var(${a.accent})`);
      preview.innerHTML = `<b>${a.name}</b> · ${p.status === "someday" ? `<i>someday</i>`
          : p.date ? `${shortDate(p.date)} <i>(${relDay(p.date)})</i>` : `<i>unscheduled</i>`}`
        + (p.time ? ` · ${p.time.start}${p.time.end ? "–" + p.time.end : ""}` : "")
        + (p.repeat ? ` · <b>${repeatLabel(p.repeat)}</b>` : "")
        + (p.hours ? ` · ${fmtHours(p.hours)}` : "")
        + (p.project ? ` · /${p.project}` : "")
        + (p.kind ? ` · ${p.kind}` : "")
        + ` — “${p.title}”`
        + (p.anchorAssumed ? ` <u>starting today; add a date to start it elsewhere</u>` : "")
        + (p.areaExplicit || this.captureArea ? "" : ` <u>defaulting to ${a.name}; add @area to change</u>`);
      return p;
    };
    input.addEventListener("input", repaint);

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const p = parseCapture(input.value, TODAY, index, fallback);
      if(p.error){ preview.className = "cappreview bad"; preview.textContent = p.error; input.focus(); return; }
      const item = { title: p.title };
      if(p.date) item.date = p.date;
      if(p.kind) item.kind = p.kind;
      if(p.time) item.time = { start: p.time.start, end: p.time.end || p.time.start };
      if(p.repeat) item.repeat = p.repeat;
      if(p.status) item.status = p.status;
      if(p.hours) item.hours = p.hours;
      if(p.project) item.project = p.project;
      if(btn) btn.disabled = true;
      try{
        const r = await post("/api/add", { area: p.area, item });
        input.value = ""; repaint();
        this.offerUndo(`Added to ${index[r.area].name}${r.areaWentLive ? " — area switched on" : ""}`);
        setTimeout(() => location.reload(), 700);
      }catch(err){
        preview.className = "cappreview bad"; preview.textContent = err.message;
      }finally{ if(btn) btn.disabled = false; }
    });

    /* "/" or "n" jumps to the capture bar, the way every good tool does */
    addEventListener("keydown", ev => {
      if(ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if(/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if(ev.key === "/" || ev.key === "n"){ ev.preventDefault(); input.focus(); }
    });
  }
};

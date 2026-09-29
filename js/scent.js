/* De Mott OS — what to wear today, from James's own "New Smells" sheet.

   The sheet already does the hard part: its Moods tab maps a mood to an
   occasion to a scent, with a status. This file only reads the day — what is
   on it, where he'll be, the forecast — and looks the answer up in that map.
   So the recommendation is his taste applied, not a model's opinion, and it
   can be wrong only in the same ways the map is.

   Three rules keep it honest:
   - Only what he can wear today is ever picked: data.wearable (bottles owned,
     and samples in hand). A row he hasn't bought falls back along its
     `fallback` to one he has, and the empty slot is named as a gap — useful
     rather than nagging, because it says which sample to order next.
   - No cue, no guess. An evening pick appears only when an evening item
     actually says date / drinks / show / wedding… A bare 19:00 row gets no
     evening scent rather than an invented occasion.
   - Private areas are never read. Health titles don't decide anything here.

   pick() is pure — tests/scent.html drives it with fixed days. */
const Scent = {
  FOG:  c => c === 3 || c === 45 || c === 48,
  RAIN: c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95,

  row(d, mood){ return d.moods.find(m => m.mood === mood) || null; },
  ok(d, row){ return !!row && (d.wearable.includes(row.status) || row.inHand === true); },

  /* A mood -> the row to actually wear, following fallbacks, plus the empty
     slot it passed over (if any). */
  resolve(d, mood){
    const want = this.row(d, mood);
    let r = want, seen = 0;
    while(r && !this.ok(d, r) && r.fallback && seen++ < 4) r = this.row(d, r.fallback);
    if(!this.ok(d, r)) return null;
    return { row: r, gap: r !== want ? want : null };
  },

  cues(d, text){
    const t = " " + String(text || "").toLowerCase() + " ";
    return Object.keys(d.cues).filter(k => d.cues[k].some(w => t.includes(w)));
  },

  /* ctx = { items:[{title,time,kind,area}], officeDay, classDay, forecast:{hi,code}|null } */
  pick(d, ctx){
    const items = (ctx.items || []).filter(e => !(e.area && e.area.private));
    const evening = e => e.time && e.time.start && e.time.start >= "17:00";
    const dayCues = new Set(items.filter(e => !evening(e)).flatMap(e => this.cues(d, e.title)));
    const f = ctx.forecast, hi = f ? f.hi : null;
    const sky = f ? (this.RAIN(f.code) ? "rain" : this.FOG(f.code) ? "fog" : "clear") : null;
    const wx = f ? `${hi}° and ${(typeof Weather !== "undefined" ? Weather.words(f.code) : "").toLowerCase() || "—"}` : "";

    /* ---- day ---- in the order a real morning decides it */
    let mood, why;
    const hit = k => items.find(e => !evening(e) && this.cues(d, e.title).includes(k));
    if(dayCues.has("presentation")){ mood = "Sharp";   why = hit("presentation").title; }
    else if(dayCues.has("brunch"))  { mood = "Playful"; why = hit("brunch").title; }
    else if(dayCues.has("outdoors")){ mood = "Wild";    why = hit("outdoors").title; }
    else if(dayCues.has("beach"))   { mood = "Salted";  why = hit("beach").title; }
    else if(ctx.officeDay)          { mood = "Composed"; why = "an office day"; }
    else if(ctx.classDay){
      // Bright citrus for a clear campus day; the wool-and-tea one when it's cool or grey.
      const bright = hi === null || (hi >= 60 && sky === "clear");
      mood = bright ? "Clear-headed / composed" : "Composed"; why = "a class day";
    } else {
      mood = hi !== null && hi >= 68 ? "Light" : "Composed"; why = "a free day";
    }
    const day = this.resolve(d, mood);
    if(day) day.reason = [why, wx].filter(Boolean).join(" · ");

    /* ---- evening ---- only when something says what the evening is */
    let eve = null;
    for(const e of items.filter(evening)){
      const c = this.cues(d, e.title);
      const m = c.includes("date") ? "Charged" : c.includes("show") ? "Edgy"
              : c.includes("dressup") ? "Celebratory" : c.includes("social") ? "Loose" : null;
      if(m){ eve = this.resolve(d, m); if(eve) eve.reason = `${e.title}, ${e.time.start}`; break; }
    }
    if(eve && day && eve.row === day.row) eve = null;   // one scent all day needs no second line

    /* ---- slots the weather wants and the shelf doesn't have ---- */
    const gaps = [day && day.gap, eve && eve.gap].filter(Boolean);
    const skyRow = sky === "rain" || sky === "fog" ? this.row(d, "Brooding") : null;
    if(skyRow && !this.ok(d, skyRow)) gaps.push(skyRow);
    const cold = hi !== null && hi <= 54 ? this.row(d, "Insulated") : null;
    if(cold && !this.ok(d, cold)) gaps.push(cold);

    return { day, evening: eve, gaps: [...new Set(gaps)] };
  },

  /* One pick as a line of the card. A sample gets its own next step from the
     sheet ("wear the sample 3x and log it"), which is the other half of what
     the sheet is for: deciding what to buy. */
  line(label, p){
    const r = p.row;
    const sample = r.status === "Sample only" || r.inHand ? `<span class="scnext">Sample — ${r.next.replace(/\.$/,"")}.</span>` : "";
    return `<div class="scpick" title="${r.why.replace(/"/g,"&quot;")}">
        <div class="sckick">${label} · ${r.mood}</div>
        <div class="scname">${r.scent}<span class="schouse">${r.house}</span></div>
        <div class="scwhy">${p.reason || ""}</div>${sample}
      </div>`;
  },

  card(d, res){
    const gaps = res.gaps.slice(0, 2).map(g =>
      `<div class="scgap">No ${g.mood.toLowerCase()} scent yet — ${g.scent !== "Open slot" ? `${g.scent} is next` : "the slot is open"}: ${g.next.replace(/\.$/,"")}.</div>`).join("");
    return `<div class="sctitle">Wearing today</div>`
      + (res.day ? this.line("Day", res.day) : `<div class="scwhy">Nothing on the shelf fits — see the sheet.</div>`)
      + (res.evening ? this.line("Tonight", res.evening) : "")
      + gaps
      + `<div class="scsrc">from <a href="${d.sheet}" target="_blank" rel="noopener">New Smells</a>, read ${shortDate(d.readAt)}</div>`;
  }
};

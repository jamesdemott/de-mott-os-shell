/* De Mott OS — quick capture.
   Turns a line like "nov 3 dentist @admin" into a real item. Pure parsing here;
   the server does the writing and validates everything again on arrival. */

const MONTH_ABBR = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const WEEKDAY_ABBR = ["sun","mon","tue","wed","thu","fri","sat"];

/* Turn a matched pattern into an ISO date, then blank it out of the text so the
   remainder can be searched for a time without the date's digits confusing it. */
function cut(text, match){
  return text.slice(0, match.index) + " " + text.slice(match.index + match[0].length);
}

function pad(n){ return String(n).padStart(2,"0"); }

function ymd(y,m,d){ return y+"-"+pad(m)+"-"+pad(d); }

/* A bare month/day with no year means the next one that hasn't happened yet. */
function inferYear(month, day, today){
  const t = parseISO(today), y = t.getFullYear();
  return ymd(y,month,day) >= today ? y : y + 1;
}

function grabDate(text, today){
  let m;
  if((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text)))
    return {date: ymd(+m[1],+m[2],+m[3]), rest: cut(text,m)};

  if((m = /\b(today|tonight)\b/i.exec(text)))
    return {date: today, rest: cut(text,m)};
  if((m = /\b(tomorrow|tmrw?|tmw)\b/i.exec(text)))
    return {date: addDays(today,1), rest: cut(text,m)};

  // Requires "in" or "+" on purpose: a bare "3d" is more likely a 3D model than
  // three days, and \b can't anchor before a "+" so it has to lead the pattern.
  if((m = /(?:\bin\s+|\+)(\d+)\s*(d|days?|w|wks?|weeks?)\b/i.exec(text)))
    return {date: addDays(today, +m[1] * (/^w/i.test(m[2]) ? 7 : 1)), rest: cut(text,m)};

  // "nov 3" / "november 3rd"
  if((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text))){
    const mo = MONTH_ABBR.indexOf(m[1].toLowerCase()) + 1, d = +m[2];
    if(d >= 1 && d <= 31) return {date: ymd(inferYear(mo,d,today),mo,d), rest: cut(text,m)};
  }
  // "3 nov" / "3rd november"
  if((m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(text))){
    const mo = MONTH_ABBR.indexOf(m[2].toLowerCase()) + 1, d = +m[1];
    if(d >= 1 && d <= 31) return {date: ymd(inferYear(mo,d,today),mo,d), rest: cut(text,m)};
  }
  // "11/3" — month first, the American way, since that's how James writes them
  if((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text))){
    const mo = +m[1], d = +m[2];
    if(mo >= 1 && mo <= 12 && d >= 1 && d <= 31){
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : inferYear(mo,d,today);
      return {date: ymd(y,mo,d), rest: cut(text,m)};
    }
  }
  // "fri" / "next thursday" — the next one, today included
  if((m = /\b(next\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|s|nesday|rsday|urday)?\b/i.exec(text))){
    const want = WEEKDAY_ABBR.indexOf(m[2].toLowerCase().slice(0,3));
    let delta = (want - parseISO(today).getDay() + 7) % 7;
    if(m[1]) delta = delta === 0 ? 7 : delta + 7;      // "next fri" skips this one
    return {date: addDays(today, delta), rest: cut(text,m)};
  }
  return null;
}

/* Times must carry am/pm or a colon. A bare number is a day-of-month far more
   often than an hour ("nov 3 dentist"), and guessing wrong is worse than asking. */
const T = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?";

function toHHMM(h, min, ap, borrowed){
  h = +h; min = min ? +min : 0;
  const suffix = ap || borrowed;
  if(suffix){
    if(h === 12) h = 0;
    if(/pm/i.test(suffix)) h += 12;
  }
  return h > 23 || min > 59 ? null : pad(h)+":"+pad(min);
}

function grabTime(text){
  let m;
  // a range: "2-4pm", "9am-5pm", "14:00-17:00"
  const range = new RegExp("\\b"+T+"\\s*(?:-|–|to)\\s*"+T+"\\b","i");
  if((m = range.exec(text))){
    const lateSuffix = m[6];                          // "2-4pm" → both are pm
    if(m[3] || m[6] || m[2] || m[5]){
      const start = toHHMM(m[1], m[2], m[3], lateSuffix);
      const end   = toHHMM(m[4], m[5], m[6], null);
      if(start && end) return {time:{start,end}, rest: cut(text,m)};
    }
  }
  const single = new RegExp("\\b"+T+"\\b","i");
  if((m = single.exec(text)) && (m[3] || m[2])){
    const start = toHHMM(m[1], m[2], m[3], null);
    if(start) return {time:{start}, rest: cut(text,m)};
  }
  return null;
}

/* ---- repeat ----
   Must run before grabDate: "every fri" would otherwise be eaten by the plain
   weekday matcher, leaving a one-off on Friday and the word "every" stranded in
   the title. A weekday rule also carries its own anchor — the next such day —
   because a rule needs a date to repeat from and "next Friday" is what someone
   who typed "every fri" means. */
const DAY_RX = "(?:sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|s|nesday|rsday|urday)?";

function grabRepeat(text, today){
  let m;

  // "every mon", "every mon and thu", "every other tue", "every 2 mondays"
  const list = new RegExp("\\bevery\\s+(other\\s+|\\d+\\s+)?(" + DAY_RX
    + "(?:\\s*(?:,|and|&)\\s*" + DAY_RX + ")*)\\b", "i");
  if((m = list.exec(text))){
    const count = (m[1] || "").trim().toLowerCase();
    const n = count === "other" ? 2 : count ? parseInt(count, 10) : 1;
    const days = m[2].toLowerCase().split(/\s*(?:,|and|&)\s*/)
      .map(d => WEEKDAY_ABBR.indexOf(d.slice(0,3)))      // WEEKDAY_ABBR is Sunday-first
      .filter(i => i >= 0)
      .map(i => WEEK3[(i + 6) % 7]);                     // WEEK3 is Monday-first
    if(days.length && n >= 1 && n <= 52){
      const on = [...new Set(days)].sort((a,b) => WEEK3.indexOf(a) - WEEK3.indexOf(b));
      // anchor on the soonest of the listed days, today included
      const anchor = on.map(d => {
        const want = (WEEK3.indexOf(d) + 1) % 7;
        return addDays(today, (want - parseISO(today).getDay() + 7) % 7);
      }).sort()[0];
      const rep = {every:"week", on};
      if(n > 1) rep.n = n;
      return {repeat: rep, date: anchor, rest: cut(text, m)};
    }
  }

  // "every day", "every 2 weeks", "every other week", "every month", "every year"
  if((m = /\bevery\s+(other\s+|\d+\s+)?(day|week|month|year)s?\b/i.exec(text))){
    const count = (m[1] || "").trim().toLowerCase();
    const n = count === "other" ? 2 : count ? parseInt(count, 10) : 1;
    if(n >= 1 && n <= 52){
      const rep = {every: m[2].toLowerCase()};
      if(n > 1) rep.n = n;
      return {repeat: rep, rest: cut(text, m)};
    }
  }

  // the one-word forms
  if((m = /\b(daily|weekly|fortnightly|biweekly|monthly|yearly|annually)\b/i.exec(text))){
    const w = m[1].toLowerCase();
    const rep = w === "daily" ? {every:"day"}
      : w === "weekly" ? {every:"week"}
      : (w === "fortnightly" || w === "biweekly") ? {every:"week", n:2}
      : w === "monthly" ? {every:"month"} : {every:"year"};
    return {repeat: rep, rest: cut(text, m)};
  }
  return null;
}

/* ---- effort ----
   "~2h", "~90m", "~1.5hrs". The tilde is required: a bare "2h" is too easy to
   type by accident inside a real title, and this is the field that drives the
   capacity read — a wrong estimate is worse than a missing one. */
function grabHours(text){
  const m = /~\s*(\d+(?:\.\d+)?)\s*(hrs?|hours?|h|mins?|minutes?|m)\b/i.exec(text);
  if(!m) return null;
  const n = parseFloat(m[1]);
  const hours = /^m/i.test(m[2]) ? n / 60 : n;
  if(!(hours > 0) || hours > 200) return null;
  return {hours: Math.round(hours * 100) / 100, rest: cut(text, m)};
}

/* ---- project ----
   "/kitchen", "/thesis-outreach". Must be preceded by whitespace or the start
   of the line, so "w/o" and "and/or" inside a title are left alone, and needs
   two characters after the slash for the same reason. */
function grabProject(text){
  const m = /(?:^|\s)\/([A-Za-z][\w-]{1,39})\b/.exec(text);
  return m ? {project: m[1], rest: cut(text, m)} : null;
}

/* areaIndex: { id: {id, name} }. defaultArea is used when no @tag is given. */
function parseCapture(raw, today, areaIndex, defaultArea){
  const out = {area: defaultArea, areaExplicit: false, date: null, title: "", kind: "", time: null,
               repeat: null, status: "", hours: null, project: ""};
  let text = " " + String(raw || "") + " ";
  if(!text.trim()) return Object.assign(out, {error: "type something"});

  let m;
  if((m = /@([a-z][\w-]*)/i.exec(text))){
    const want = m[1].toLowerCase();
    const hit = Object.values(areaIndex).find(a =>
      a.id === want || a.id.startsWith(want) || a.name.toLowerCase().replace(/[^a-z]/g,"").startsWith(want));
    if(!hit) return Object.assign(out, {error: "no area called @" + m[1]});
    out.area = hit.id; out.areaExplicit = true; text = cut(text, m);
  }
  if((m = /#someday\b/i.exec(text))){
    out.status = "someday"; text = cut(text, m);
  }
  if((m = /#(due|class|admin)\b/i.exec(text))){
    out.kind = m[1].toLowerCase(); text = cut(text, m);
  }

  const pj = grabProject(text);
  if(pj){ out.project = pj.project; text = pj.rest; }

  const hr = grabHours(text);
  if(hr){ out.hours = hr.hours; text = hr.rest; }

  // Before the date, on purpose — see grabRepeat.
  const rp = grabRepeat(text, today);
  if(rp){ out.repeat = rp.repeat; text = rp.rest; }

  const d = grabDate(text, today);
  if(d){ out.date = d.date; text = d.rest; }
  else if(rp && rp.date){ out.date = rp.date; }

  // A rule has to start somewhere, and the server refuses one with no anchor.
  // "every month" with nothing else said means starting now; the preview shows
  // the date it picked, so it is a visible default rather than a silent one.
  if(out.repeat && !out.date){ out.date = today; out.anchorAssumed = true; }

  const t = grabTime(text);
  if(t){ out.time = t.time; text = t.rest; }

  out.title = text.replace(/\s+/g," ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g,"");
  if(out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);

  // No date is fine — most of what you capture has none ("call the dentist").
  // It lands unscheduled and you give it a date when it earns one.
  out.unscheduled = !out.date;
  if(out.status === "someday" && out.date && !out.repeat)
    out.error = "#someday and a date contradict each other — pick one";
  if(!out.title) out.error = "what? give it a name";
  return out;
}

/* Items carry a short stable id assigned by serve.py, so renaming or
   rescheduling one keeps whatever state is attached to it. */

async function post(path, body){
  /* Away from the desk there is no server to post to, so the four writes that
     matter on a phone — capture, tick, edit, delete — are queued into the repo
     instead and replayed on the Mac. Everything else on this list needs the
     Mac itself (a subprocess, the undo stack, an API key) and says so rather
     than appearing to work. */
  if(typeof Outbox !== "undefined" && (await dataSource()).mode !== "local"){
    if(Outbox.WRITES[path]) return Outbox.queue(path, body);
    throw new Error("that one needs your Mac — this copy can capture, tick, edit and delete, nothing else");
  }
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"},
                               body: JSON.stringify(body)});
  const data = await r.json().catch(() => ({error:"server sent something odd"}));
  if(!r.ok) throw new Error(data.error || ("server said " + r.status));
  return data;
}

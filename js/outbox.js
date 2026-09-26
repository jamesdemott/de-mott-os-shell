/* De Mott OS — capture and ticking from away from the desk.
 *
 * The phone never edits events.json. It writes an append-only outbox: one new
 * file per action, PUT to the repo's Contents API under data/outbox/. A file
 * that did not exist cannot conflict with anything, ever — which is the whole
 * reason for this shape. Two writers editing one JSON array would need a merge;
 * two writers adding differently-named files need nothing.
 *
 * The Mac drains it (sync_outbox.py) by replaying each entry through the same
 * /api/add, /api/done, /api/update and /api/delete handlers a desk capture
 * goes through — so validation, the undo stack, the commit message and the
 * private-area rules all apply unchanged. Nothing here is a second write path
 * into the data; it is a queue in front of the only one.
 *
 * Three properties worth not breaking:
 *
 *   Local first, upload second. An op is recorded in localStorage before any
 *   network is attempted, so capture works in a tunnel and uploads later. A
 *   capture bar that needs signal is a capture bar he stops trusting.
 *
 *   The queue prunes itself. overlay() drops an op the moment the data it read
 *   already agrees with it — the item is in the feed, the tick is in state.
 *   So once the Mac drains an entry it disappears from here on the next read,
 *   with no acknowledgement to coordinate and nothing to get out of step.
 *
 *   Ids are minted here. clean() in serve.py honours a supplied id, so the
 *   item that lands on the Mac is the same item this page has been showing,
 *   and a tick queued against it finds it. Minting server-side would mean a
 *   tick could reference an id that never existed.
 */
const Outbox = {
  LS: "dmos:outbox",
  WRITES: { "/api/add": 1, "/api/update": 1, "/api/delete": 1, "/api/done": 1 },

  /* ---- the local queue ---- */
  list(){ try{ return JSON.parse(localStorage.getItem(this.LS)) || []; }catch(e){ return []; } },
  save(ops){ try{ localStorage.setItem(this.LS, JSON.stringify(ops)); }catch(e){} },
  waiting(){ return this.list().length; },
  unsent(){ return this.list().filter(o => !o.sent).length; },

  hex(n){ const b = new Uint8Array(n); crypto.getRandomValues(b);
          return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); },
  newItemId(){ return this.hex(4); },              /* matches serve.py's new_id() */
  newOpId(){ return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)
                  + "-" + this.hex(4); },          /* sortable, and a safe filename */

  feedFor(area){
    const cfg = cacheGet("data/areas.json");
    const a = cfg && (cfg.areas || []).find(x => x.id === area);
    return (a && a.feed) || ("data/" + area + "/events.json");
  },
  titleOf(area, id){
    const rows = cacheGet(this.feedFor(area)) || [];
    const hit = rows.find(r => r.id === id);
    return (hit && hit.title) || "that item";
  },

  /* ---- queueing ---- */
  async queue(path, body){
    const op = { opId: this.newOpId(), path, body, at: new Date().toISOString(), sent: false };
    let reply;

    if(path === "/api/add"){
      const item = Object.assign({}, body.item);
      item.id = item.id || this.newItemId();
      /* The same two defaults api_add applies, applied here instead, so what
         this page shows and what lands on the Mac are the same object. */
      if(item.source === undefined) item.source = "capture";
      if(item.added  === undefined) item.added  = TODAY;
      op.body = { area: body.area, item };
      op.feed = this.feedFor(body.area);
      reply = { ok: true, queued: true, item, area: body.area, areaWentLive: false };
    } else if(path === "/api/delete"){
      op.feed = this.feedFor(body.area);
      reply = { ok: true, queued: true, deleted: this.titleOf(body.area, body.id) };
    } else if(path === "/api/update"){
      op.feed = this.feedFor(body.area);
      reply = { ok: true, queued: true };
    } else {                                                      /* /api/done */
      reply = { ok: true, queued: true, key: body.id, done: !!body.done };
    }

    const ops = this.list(); ops.push(op); this.save(ops);        /* local first */
    this.upload(op).catch(() => {});                              /* then the network */
    return reply;
  },

  async upload(op){
    const t = localStorage.getItem("dmos:gh");
    if(!t) throw new Error("no token");
    const payload = JSON.stringify({ opId: op.opId, path: op.path, body: op.body, at: op.at }, null, 1);
    const r = await fetch("https://api.github.com/repos/" + GH_REPO
                        + "/contents/data/outbox/" + op.opId + ".json",
      { method: "PUT",
        headers: { Authorization: "Bearer " + t, "Content-Type": "application/json",
                   "X-GitHub-Api-Version": "2022-11-28" },
        body: JSON.stringify({
          message: "outbox: " + op.path.replace("/api/", "") + " from phone",
          branch: GH_REF,
          content: b64(payload) }) });
    /* 422 is "a file by that name is already there", which for a create-only
       PUT means this exact op is already uploaded. That is success. */
    if(!r.ok && r.status !== 422) throw new Error("upload → " + r.status);
    const ops = this.list();
    const me = ops.find(o => o.opId === op.opId);
    if(me){ me.sent = true; this.save(ops); }
    return true;
  },

  /* Anything that was captured without signal goes up on the next page that
     has some. Quiet either way: a failed retry must never surface as an error
     the way a failed capture would. */
  async flush(){
    for(const op of this.list().filter(o => !o.sent)){
      try{ await this.upload(op); }catch(e){ break; }
    }
  },

  /* ---- the overlay ----
     Applied to every file j() hands back, so a queued capture is visible on
     Today, To-do, its area page and the review without any of them knowing
     this exists. Ops that the data already reflects are dropped here. */
  overlay(path, value){
    const ops = this.list();
    if(!ops.length) return value;
    const keep = [], seen = [];

    for(const op of ops){
      let landed = false;
      if(op.path === "/api/done" && path === "data/state.json"){
        const have = value && value.done && value.done[op.body.id] !== undefined;
        landed = have === !!op.body.done;
      } else if(op.feed === path && Array.isArray(value)){
        const id = op.path === "/api/add" ? op.body.item.id : op.body.id;
        const there = value.some(r => r.id === id);
        landed = op.path === "/api/add" ? there
               : op.path === "/api/delete" ? !there
               : there && matches(value.find(r => r.id === id), op.body.patch);
      }
      (landed ? seen : keep).push(op);
    }
    if(seen.length) this.save(keep);

    /* Now apply what is left that touches this file. */
    if(path === "data/state.json"){
      const out = { done: Object.assign({}, (value && value.done) || {}) };
      for(const op of keep) if(op.path === "/api/done"){
        if(op.body.done) out.done[op.body.id] = op.at;
        else delete out.done[op.body.id];
      }
      return out;
    }
    if(path === "data/areas.json" && value && value.areas){
      /* A capture into a dormant area switches it on, the way api_add does —
         otherwise the thing he just captured renders nowhere. */
      for(const op of keep) if(op.path === "/api/add"){
        const a = value.areas.find(x => x.id === op.body.area);
        if(a && (!a.live || !a.feed)){ a.live = true; a.feed = a.feed || op.feed; }
      }
      return value;
    }
    if(!Array.isArray(value)) return value;

    let rows = value;
    for(const op of keep){
      if(op.feed !== path) continue;
      if(op.path === "/api/add")    rows = rows.concat([Object.assign({ pending: true }, op.body.item)]);
      if(op.path === "/api/delete") rows = rows.filter(r => r.id !== op.body.id);
      if(op.path === "/api/update") rows = rows.map(r =>
        r.id === op.body.id ? Object.assign({}, r, op.body.patch, { pending: true }) : r);
    }
    return rows;
  }
};

/* A patch has landed when the item already says what the patch asked for. */
function matches(row, patch){
  if(!row || !patch) return false;
  return Object.keys(patch).every(k =>
    JSON.stringify(row[k] === undefined ? null : row[k]) ===
    JSON.stringify(patch[k] === undefined || patch[k] === "" ? null : patch[k]));
}

/* btoa() is bytes, not characters: a title with an em dash or an accent in it
   throws without this. The whole project is full of em dashes. */
function b64(s){
  const bytes = new TextEncoder().encode(s);
  let out = ""; for(const b of bytes) out += String.fromCharCode(b);
  return btoa(out);
}


/* Anything captured without signal goes up as soon as a page loads with some.
   Silent on failure: a retry that fails is just a retry that happens later. */
addEventListener("load", () => {
  if(!Outbox.unsent()) return;
  dataSource().then(s => { if(s.mode !== "local") Outbox.flush(); });
});

/* De Mott OS — notes captured on the iPhone.
   An iOS Shortcut drops one text file per note into iCloud Drive. This picks
   them up when the page opens, parses each line with the SAME parser the
   capture bar uses (js/capture.js — a second parser would drift from it), files
   them, and moves the originals into Inbox/filed/ so nothing is deleted.

   It runs quietly: no phone notes, no trace on the page. A failure is shown
   once and never blocks anything else. */

(function(){
  async function ingest(cfg){
    let notes=[];
    try{ notes=(await post("/api/phone/list",{})).notes||[]; }
    catch(err){ return; }                       // server busy or offline: next time
    const usable=notes.filter(n=>n.text);
    if(!usable.length) return;

    const filed=[], failed=[];
    for(const n of usable){
      try{
        const p=parseCapture(n.text, TODAY, Object.fromEntries(cfg.areas.map(a=>[a.id,a])),
                             cfg.defaultCaptureArea||"admin");
        if(p.error){ failed.push(`${n.text} — ${p.error}`); continue; }
        const item={title:p.title};
        for(const k of ["date","kind","time","repeat","hours","project","status"])
          if(p[k]) item[k]=p[k];
        item.note="From my phone";
        await post("/api/add",{area:p.area,item});
        filed.push(n.file);
      }catch(err){ failed.push(`${n.text} — ${err.message}`); }
    }
    if(filed.length) await post("/api/phone/filed",{files:filed}).catch(()=>{});

    const bits=[];
    if(filed.length) bits.push(`Filed ${filed.length} note${filed.length===1?"":"s"} from your phone`);
    if(failed.length) bits.push(`${failed.length} couldn't be read — still in iCloud`);
    if(bits.length){
      Rows.toast(bits.join(" · ")+` · <button class="tlink" id="phonereload">show</button>`, 9000);
      const b=document.getElementById("phonereload");
      if(b) b.addEventListener("click",()=>location.reload());
    }
  }
  window.PhoneCapture={ingest};
})();

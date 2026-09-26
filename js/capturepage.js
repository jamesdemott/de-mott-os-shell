/* De Mott OS — the Capture tab.
   Both boxes used to sit on the front page; James asked for them on their own
   tab (2026-09-15) because they crowded out what the front page is for, which
   is seeing today. The bar still lives on each area's list page, scoped to it. */

(async function(){
try{
  const cfg=await j("data/areas.json");
  Nav.render(cfg,"capture");
  Rows.cfg=cfg;
  Rows.wire();
  const n=cfg.areas.filter(a=>a.live).length;
  $("rebuild").textContent=`Goes to whichever area you tag — ${n} live · `
    + `no tag means ${cfg.defaultCaptureArea}`;
}catch(err){
  $("boot").innerHTML=`<div class="err"><strong>Couldn't load.</strong><br>${err.message}</div>`;
}
})();

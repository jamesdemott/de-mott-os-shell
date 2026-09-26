/* De Mott OS — the brain-dump box.
   Type whatever is in your head; serve.py hands it to Claude, which files it
   through the same write endpoints the rest of the page uses. It can add,
   reschedule, tick off and update tracker rows — it cannot change De Mott OS
   itself, so a request like "make the tracker sortable" lands in the inbox for
   a coding session instead. Every action it takes is undoable like any other. */

(function(){
  const box=document.getElementById("thinkbox");
  if(!box) return;
  const btn=document.getElementById("thinkbtn"), out=document.getElementById("thinkout");
  let busy=false;

  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const say=(cls,html)=>{ out.className="thinkout "+cls; out.innerHTML=html; };

  async function send(){
    const text=box.value.trim();
    if(!text || busy) return;
    busy=true; btn.disabled=true; btn.textContent="thinking…";
    say("wait","Reading it and filing what it finds. This takes a few seconds.");
    try{
      const r=await post("/api/think",{text});
      if(r.needsKey){
        say("warn",`<b>No API key yet.</b> Double-click <code>Set API Key.command</code> in the
          De Mott OS folder — it asks for the key without showing it on screen.`);
        return;
      }
      const did=(r.actions||[]).map(a=>`<li>${esc(a.detail)}</li>`).join("");
      say("good", (r.summary?`<p>${esc(r.summary).replace(/\n/g,"<br>")}</p>`:"")
        + (did?`<ul class="thinkdid">${did}</ul>`:`<p class="thinknone">Nothing was filed.</p>`)
        + (did?`<button class="mini" id="thinkreload">show it on the page</button>`:""));
      if(did){
        box.value="";
        document.getElementById("thinkreload").onclick=()=>location.reload();
      }
    }catch(err){
      say("warn",`<b>That didn't work.</b> ${esc(err.message)}`);
    }finally{
      busy=false; btn.disabled=false; btn.textContent="send to Claude";
    }
  }

  btn.addEventListener("click",send);
  // Enter is a newline here — this is a paragraph box, not a one-liner — so
  // sending is the button or Cmd/Ctrl+Enter.
  box.addEventListener("keydown",ev=>{
    if(ev.key==="Enter" && (ev.metaKey||ev.ctrlKey)){ ev.preventDefault(); send(); }
  });
})();

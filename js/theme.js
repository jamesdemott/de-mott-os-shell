/* De Mott OS — shared chrome. Runs on every page. */
/* theme toggle — cycles system → light → dark, remembered across pages */
(function(){
  const b=document.getElementById("themebtn"); if(!b)return;
  const modes=["","light","dark"]; let i=0;
  try{ const s=localStorage.getItem("desk-theme"); if(s){i=modes.indexOf(s); if(i<0)i=0;} }catch(e){}
  const apply=()=>{ const m=modes[i];
    if(m) document.documentElement.setAttribute("data-theme",m);
    else document.documentElement.removeAttribute("data-theme");
    b.textContent="theme: "+(m||"system");
    try{ localStorage.setItem("desk-theme",m); }catch(e){} };
  apply();
  b.addEventListener("click",()=>{ i=(i+1)%modes.length; apply(); });
})();

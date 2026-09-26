/* De Mott OS — the tab bar, on every page. Built from data/areas.json so a new
   area gets a tab without touching any HTML. Call Nav.render(cfg, current). */
const Nav = {
  render(cfg, current){
    const host = document.getElementById("nav");
    if(!host) return;
    const tabs = [
      {id:"today", label:"Today",  href:"index.html"},
      {id:"capture", label:"Capture", href:"capture.html"},
      {id:"todo",  label:"To-do",  href:"todo.html"},
    ];
    (cfg.areas || []).filter(a => a.live && a.href).forEach(a =>
      tabs.push({id:a.id, label:a.name, href:a.href, accent:a.accent}));
    // Review and Done sit after the areas, not before: they're the weekly
    // pass and the record, not somewhere you land every day.
    tabs.push({id:"review", label:"Review", href:"review.html"},
              {id:"done",   label:"Done",   href:"done.html"});

    host.innerHTML = tabs.map(t =>
      `<a class="navtab${t.id === current ? " on" : ""}" href="${t.href}"`
      + (t.accent ? ` style="--area:var(${t.accent})"` : "")
      + `>${t.label}</a>`).join("");
  }
};

/* De Mott OS — the token page.
 *
 * The token is never echoed, never logged, and never leaves this device except
 * as an Authorization header to api.github.com. The field is write-only: after
 * a save it is cleared, and a stored token is reported by its shape and its
 * last four characters, never in full. Same rule as .canvas_token — a secret
 * that is printed somewhere is a secret that ends up in a screenshot.
 */
(async () => {
  const state = $("state");
  const say = (text, cls) => { state.className = "state" + (cls ? " " + cls : ""); state.innerHTML = text; };
  const tail = t => "…" + t.slice(-4);

  /* The nav needs areas.json, which needs the token this page exists to set.
     So it is best-effort: no token yet means no tabs, not a broken page. */
  try { Nav.render(await j("data/areas.json"), "setup"); } catch (e) {}

  async function check() {
    const t = localStorage.getItem("dmos:gh");
    if (!t) { say("No token stored on this device yet.", "bad"); return; }
    say("Stored (<b>" + tail(t) + "</b>). Checking it against GitHub…");
    try {
      const r = await fetch("https://api.github.com/repos/" + GH_REPO + "/contents/data/areas.json?ref=" + GH_REF,
        { headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github.raw",
                     "X-GitHub-Api-Version": "2022-11-28" } });
      if (r.status === 404)
        return say("Stored (<b>" + tail(t) + "</b>), but the repo came back <b>404</b>. "
                 + "That is what a private repo says to a token that cannot see it — "
                 + "check the token picked <code>de-mott-os</code> under Repository access.", "bad");
      if (!r.ok)
        return say("Stored (<b>" + tail(t) + "</b>), but GitHub answered <b>" + r.status + "</b>.", "bad");
      const f = await freshness();
      say("Working. Reading <b>" + GH_REPO + "</b> — data is <b>" + f.text + "</b>.", f.bad ? "bad" : "ok");
    } catch (e) {
      say("Stored (<b>" + tail(t) + "</b>), but the request failed: " + e.message
        + ". If you are offline that is expected — the cached copy still renders.", "bad");
    }
  }

  $("save").onclick = () => {
    const el = $("tok"), v = el.value.trim();
    el.value = "";                                   /* never leave it on screen */
    if (!v) return say("Nothing pasted.", "bad");
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v))
      return say("That does not look like a GitHub token — they start "
               + "<code>github_pat_</code> (fine-grained) or <code>ghp_</code>. Nothing was saved.", "bad");
    try { localStorage.setItem("dmos:gh", v); }
    catch (e) { return say("This browser refused to store it: " + e.message, "bad"); }
    _src = null;                                     /* re-probe with the new token */
    check();
  };

  $("test").onclick = () => { _src = null; check(); };

  $("clear").onclick = () => {
    localStorage.removeItem("dmos:gh");
    Object.keys(localStorage).filter(k => k.startsWith(CK) || k === "dmos:asof")
          .forEach(k => localStorage.removeItem(k));
    _src = null;
    say("Token and cached data both removed from this device.", "bad");
  };

  check();
})();

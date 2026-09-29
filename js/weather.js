/* De Mott OS — the weather, for the masthead's ear and the Sunday Edition.

   The one live read from outside the Mac besides GitHub, and it is chosen to
   be the harmless kind: Open-Meteo needs no key and no account, and the only
   thing sent is the coordinates in data/areas.json (ears.weather) — a city,
   not a person. It is a classic newspaper ear, which is the whole case for it.

   It fails silent on purpose. No network, a captive portal, Open-Meteo down:
   the ear simply doesn't print, the same as the other ear when it has nothing
   true to say. A forecast is never worth an error on the front page.

   One fetch an hour at most. The last answer is kept in localStorage — a
   per-browser convenience, and wrapped, because private windows throw on it. */
const Weather = {
  TTL: 60 * 60 * 1000,

  /* WMO weather codes -> words a paper would print. */
  words(code){
    if(code === 0) return "Clear";
    if(code === 1) return "Mostly clear";
    if(code === 2) return "Partly cloudy";
    if(code === 3) return "Overcast";
    if(code === 45 || code === 48) return "Fog";
    if(code >= 51 && code <= 57) return "Drizzle";
    if(code >= 61 && code <= 67) return "Rain";
    if(code >= 71 && code <= 77) return "Snow";
    if(code >= 80 && code <= 82) return "Showers";
    if(code >= 95) return "Thunder";
    return "";
  },

  async get(place){
    if(!place || place.lat == null || place.lon == null) return null;
    const key = "dmos:weather:" + place.lat + "," + place.lon;
    try{
      const hit = JSON.parse(localStorage.getItem(key) || "null");
      if(hit && Date.now() - hit.at < this.TTL) return hit.data;
    }catch(_){}
    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${encodeURIComponent(place.lat)}&longitude=${encodeURIComponent(place.lon)}`
      + "&current=temperature_2m,weather_code"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
      + "&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=7";
    try{
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      clearTimeout(t);
      if(!r.ok) return null;
      const w = await r.json();
      const d = w.daily || {};
      const data = {
        now: w.current ? { temp: Math.round(w.current.temperature_2m), code: w.current.weather_code } : null,
        days: (d.time || []).map((date, i) => ({
          date, code: d.weather_code[i],
          hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]),
          rain: d.precipitation_probability_max[i]
        }))
      };
      try{ localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); }catch(_){}
      return data;
    }catch(_){ return null; }
  }
};

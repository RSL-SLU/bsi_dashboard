"use strict";
// ============================================================================ Case studies tab
// Loaded after analyzer.js; uses index_v1 / analyzer globals (d3, $, esc, fmt, human, COUNTRIES, STATUS, kfmt, opShort,
// hasImg, openFarm, showTip, hideTip, setTab). Data: casestudy.json (scripts/case_data.py, from data/runs/case_annual).
// Images: the review app's /api/img route locally; the hosted copy sets CS_FILES and ships cases/<op>_<year>_<tci|bsi>.*
let CSD = null;
const CS = { op: null, year: 2025, kind: "tci", ev: "", pond: null };
const CS_EV = {   // candidate -> label, colour, plain-language rule
  new: ["New pond", "#ec8454", "absent in at least 2 reliable years, then present every reliable year to 2025 (one gap allowed)"],
  removed: ["Removed or covered", "#e66767", "present in at least 2 reliable years, then absent in at least 2 reliable years up to 2025"],
  transient: ["Transient", "#e0a526", "present in at least 2 reliable years, never in two consecutive ones"],
  seasonal: ["Seasonal", "#5fa8ff", "present at the start and in 2025, with 1 or 2 missing years between"],
  one_off: ["One year only", "#9aa29c", "present in exactly one year"],
  mixed: ["Mixed", "#b3a6ff", "any other pattern"] };
const CS_SUG = { "pond_built/pond_added": "pond built or added", first_pond_detected: "first pond detected", "pond_removed/pond_covered": "pond removed or covered",
  operation_appears: "operation appears", transient: "transient" };
const CS_CN = { CHN: "China", USA: "Kansas, USA" };
const csYearCol = d3.scaleSequential([2017, 2025], d3.interpolateRgbBasis(["#7fd6c2", "#5fa8ff", "#b3a6ff", "#f2b84b", "#ec8454"]));
const csImg = (op, y, k) => typeof CS_FILES !== "undefined" ? `cases/${op}_${y}_${k}.${k === "tci" ? "jpg" : "png"}`
  : `/api/img/${encodeURIComponent(op)}/${k === "bsi" ? "bsi-e" : "tci"}/${y}.png`;
const csSite = () => CSD.sites.find((s) => s.op === CS.op);
const csName = (op) => opShort(op);

document.head.insertAdjacentHTML("beforeend", `<style>
body.cst #lcol,body.cst #rcol,body.cst #mid,body.cst #leg,body.cst #time,body.cst .leaflet-control-container,body.cst #step,body.cst .crumbs{display:none!important}
#cst{position:fixed;inset:52px 0 0 0;z-index:950;overflow-y:auto;scrollbar-width:thin;padding:16px 18px 40px;
  background:radial-gradient(1100px 700px at 85% -10%,rgba(95,168,255,.10),transparent 60%),radial-gradient(900px 600px at 0% 30%,rgba(236,132,84,.08),transparent 60%),rgba(9,10,12,.72);
  backdrop-filter:blur(30px) saturate(140%);-webkit-backdrop-filter:blur(30px) saturate(140%)}
#cst .wrap{max-width:1560px;margin:0 auto}
.cs-lay{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:980px){.cs-lay{grid-template-columns:1fr}}
.cs-list{position:sticky;top:0;max-height:calc(100vh - 90px);overflow:auto;scrollbar-width:thin;padding:12px}
.cs-list h4{margin:10px 2px 6px;font:700 10.5px var(--fb);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.cs-it{cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:7px 9px;border-radius:10px;border:1px solid transparent}
.cs-it:hover{background:rgba(255,255,255,.07)}
.cs-it.on{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.35)}
.cs-it b{font:600 12px var(--fm);color:#fff}
.cs-it small{grid-column:1/-1;color:var(--muted);font-size:11px}
.cs-it .dots{display:flex;gap:3px;align-items:center}
.cs-it .dots i{width:7px;height:7px;border-radius:50%}
.cs-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;margin-bottom:14px}
.cs-head h2{margin:0;font:800 26px/1 var(--fd);font-stretch:74%}
.cs-head .cs-tag{font:600 11px var(--fb);padding:3px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.25);color:var(--ink2)}
.cs-head .sp{flex:1}
.cs-btn{all:unset;cursor:pointer;font:600 12px var(--fb);padding:5px 13px;border-radius:999px;background:rgba(255,255,255,.9);color:#15181b}
.cs-btn:hover{background:#fff}
.cs-strip{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:8px}
@media (max-width:1100px){.cs-strip{grid-template-columns:repeat(5,minmax(0,1fr))}}
.cs-th{cursor:pointer;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);transition:transform .15s,border-color .15s}
.cs-th:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.5)}
.cs-th.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.cs-th .im{aspect-ratio:1;background:#0b0d10 center/contain no-repeat;display:grid;place-items:center;color:var(--muted);font-size:11px}
.cs-th .cap{padding:5px 7px;font:500 10.5px var(--fm);color:var(--ink2);display:flex;gap:6px;align-items:center}
.cs-th .cap b{color:#fff;font-size:12px}
.cs-th .cap .w{margin-left:auto;color:#f2b84b}
.cs-pill{display:inline-flex;align-items:center;gap:6px;font:600 11.5px var(--fb);padding:2px 9px 2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;white-space:nowrap}
.cs-pill i{width:8px;height:8px;border-radius:50%}
.cs-grid rect.c,.cs-grid circle.c{cursor:pointer}
.cs-grid .row:hover .lbl{fill:#fff}
.cs-map path.pd{cursor:pointer;transition:fill-opacity .15s}
#cst .az-tbl td{white-space:normal}
</style>`);

// ---------------------------------------------------------------------------- tab plumbing
$("#tabs").insertAdjacentHTML("beforeend", `<button data-t="cst">Case studies</button>`);
document.body.insertAdjacentHTML("beforeend", `<main id="cst" hidden><div class="wrap" id="cstw"></div></main>`);
const CS_READY = d3.json("casestudy.json").then((d) => { CSD = d; }).catch((e) => { console.error("casestudy.json", e); CSD = null; });
{
  const prev = setTab;
  setTab = function (t, region) {   // eslint-disable-line no-func-assign
    prev(t === "cst" ? "none" : t, region);
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    document.body.classList.toggle("cst", t === "cst"); $("#cst").hidden = t !== "cst";
    if (t === "cst") CS_READY.then(() => { buildCase(); $("#cst").scrollTop = 0; });
  };
  document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => setTab(b.dataset.t));
}

// ---------------------------------------------------------------------------- page
function csStats() {
  const S = CSD.sites, chk = CSD.check, ev = S.flatMap((s) => s.events.map((e) => ({ ...e, c: s.c })));
  const ks = S.filter((s) => s.c === "USA"), dry = ks.filter((s) => {
    const a = (y) => (s.years.find((r) => r.y === y) || {}).a;
    return a(2022) != null && a(2021) != null && a(2023) != null && a(2022) < a(2021) && a(2022) < a(2023);
  });
  return { S, chk, ev, match: chk.filter((c) => c.match).length, miss: chk.filter((c) => !c.match), dry, ks,
    ponds: d3.rollup(S.flatMap((s) => s.ponds.map(() => s.c)), (v) => v.length, (c) => c) };
}

function buildCase() {
  if (!CSD) { $("#cstw").innerHTML = `<p class="say">casestudy.json is missing: run scripts/case_data.py.</p>`; return; }
  const st = csStats(), Y = CSD.years;
  if (!CS.op) CS.op = st.S[0].op;
  const evN = d3.rollup(st.ev, (v) => v.length, (e) => e.cand), newN = evN.get("new") || 0, remN = evN.get("removed") || 0;
  $("#cstw").innerHTML = `
  <div class="az-top"><div><h1>Case studies</h1><div class="sub">${st.S.length} sites followed every summer from ${Y[0]} to ${Y[Y.length - 1]} to test how manure ponds change over time</div></div>
    <span class="sp"></span><div class="az-jump"><a data-j="why">Why these sites</a><a data-j="all">All sites</a><a data-j="site">Site explorer</a><a data-j="lim">Limitations</a></div></div>

  <div class="az-sec" id="cs-why"><h2><em>1</em>Why these sites?</h2><span>The QC map shows one year (2025). These sites test whether the same pond rule can follow each pond back through nine summers.</span></div>
  <div class="az-f4">
    <div class="card f4"><div class="k">Matches production</div><div class="v" style="color:#4cc27a">${st.match} / ${st.chk.length}</div>
      <div class="s">reviewed sites reproduce the 2025 production result exactly (pond count and area).${st.miss.length ? ` ${esc(csName(st.miss[0].operation_id))} differs by one 10 m pixel.` : ""}</div></div>
    <div class="card f4"><div class="k">Ponds tracked</div><div class="v" style="color:#5fa8ff">${d3.sum(st.S, (s) => s.ponds.length)}</div>
      <div class="s">stable pond IDs (${st.ponds.get("CHN") || 0} China, ${st.ponds.get("USA") || 0} Kansas). One ID follows a pond through wet and dry years.</div></div>
    <div class="card f4"><div class="k">Candidate changes</div><div class="v" style="color:#ec8454">${st.ev.length}</div>
      <div class="s">rule-based candidates for review: ${newN} new, ${remN} removed or covered; the rest are seasonal, transient or single-year detections.</div></div>
    <div class="card f4"><div class="k">Kansas 2022 dry year</div><div class="v" style="color:#f2b84b">${st.dry.length} / ${st.ks.length}</div>
      <div class="s">Kansas sites have less pond area in 2022 than in both 2021 and 2023: a regional drought, not a change at the farms.</div></div>
  </div>
  <div class="az-grid" style="margin-top:14px">
    <div class="card s5"><div class="hd"><h3>Candidate changes by country</h3></div><p class="say">Number of ponds per rule outcome. Only new and removed are potential real events; the others usually close as no change after review.</p><svg id="csEv"></svg><div class="keys" id="csEvK"></div></div>
    <div class="card s7"><div class="hd"><h3>Production check, 2025</h3></div><p class="say">Our yearly run against the production QC run for the same 2025 window. Pilot picks (3 Kansas sites without a QC record) are not in production.</p><div class="tblwrap" style="max-height:300px" id="csChk"></div></div>
  </div>

  <div class="az-sec" id="cs-all"><h2><em>2</em>All sites, all years</h2><span>Total pond area per site and summer, relative to the site's own average. Select a row to open the site below.</span></div>
  <div class="az-grid"><div class="card s12"><svg id="csHm"></svg><div class="keys" id="csHmK"></div></div></div>

  <div class="az-sec" id="cs-site"><h2><em>3</em>Site explorer</h2><span>Each pond's history, the images behind it and the rule's suggestion</span></div>
  <div class="cs-lay"><div class="card cs-list" id="csList"></div><div id="csDet"></div></div>

  <div class="az-sec" id="cs-lim"><h2><em>4</em>Limitations</h2><span>What to keep in mind when reading these histories</span></div>
  <div class="az-grid"><div class="card s12" id="csLim"></div></div>`;
  document.querySelectorAll("#cstw .az-jump a").forEach((a) => a.onclick = () => $("#cs-" + a.dataset.j).scrollIntoView({ behavior: "smooth" }));
  drawCsEvents(st); drawCsCheck(st); drawCsHeat(); drawCsList(); drawCsSite(); drawCsLim(st);
}

function drawCsEvents(st) {
  const K = Object.keys(CS_EV), C = ["CHN", "USA"], W = 520, rh = 34, x0 = 96, H = 28 + C.length * rh + 26;
  const tot = C.map((c) => K.map((k) => st.ev.filter((e) => e.c === c && e.cand === k).length)), mx = d3.max(tot, (r) => d3.sum(r)) || 1;
  const x = d3.scaleLinear([0, mx], [x0, W - 30]);
  let s = "";
  C.forEach((c, i) => { let acc = 0; const yy = 20 + i * rh;
    s += `<text x="${x0 - 8}" y="${yy + 15}" text-anchor="end" font-size="12" font-weight="700" style="fill:#fff">${CS_CN[c]}</text>`;
    K.forEach((k, j) => { const n = tot[i][j]; if (!n) return; const xa = x(acc), xb = x(acc + n); acc += n;
      s += `<rect class="evb" data-k="${k}" data-c="${c}" data-n="${n}" x="${xa}" y="${yy}" width="${Math.max(1, xb - xa - 1.5)}" height="22" rx="4" fill="${CS_EV[k][1]}" fill-opacity=".85"/>` +
        (xb - xa > 18 ? `<text x="${(xa + xb) / 2}" y="${yy + 15}" text-anchor="middle" font-size="11" font-family="IBM Plex Mono" style="fill:#15181b;pointer-events:none">${n}</text>` : ""); });
    s += `<text x="${x(acc) + 6}" y="${yy + 15}" font-size="11" font-family="IBM Plex Mono">${acc}</text>`; });
  const tk = x.ticks(5);
  s += tk.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="16" y2="${20 + C.length * rh - 8}" stroke="rgba(255,255,255,.08)"/><text x="${x(t)}" y="${20 + C.length * rh + 6}" text-anchor="middle" font-size="9.5">${t}</text>`).join("");
  s += `<text class="axt" x="${(x0 + W - 30) / 2}" y="${H - 2}" text-anchor="middle" font-size="9.5">Number of ponds</text>`;
  const svg = $("#csEv"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
  svg.querySelectorAll(".evb").forEach((r) => { r.onmousemove = (e) => showTip(`<b>${CS_EV[r.dataset.k][0]}</b> · ${CS_CN[r.dataset.c]}<br>${r.dataset.n} pond(s)<br><span style="color:var(--muted)">${CS_EV[r.dataset.k][2]}</span>`, e); r.onmouseleave = hideTip; });
  $("#csEvK").innerHTML = K.filter((k) => st.ev.some((e) => e.cand === k)).map((k) => `<span><i style="background:${CS_EV[k][1]}"></i>${CS_EV[k][0]}</span>`).join("");
}

function drawCsCheck(st) {
  const sel = Object.fromEntries(CSD.sites.map((s) => [s.op, s]));
  const rows = st.chk.slice().sort((a, b) => a.match - b.match || a.operation_id.localeCompare(b.operation_id));
  $("#csChk").innerHTML = `<table class="az-tbl"><thead><tr><th>Site</th><th class="num">Ponds (ours / prod.)</th><th class="num">Area ha (ours / prod.)</th><th>Result</th></tr></thead><tbody>${rows.map((c) =>
    `<tr class="go" data-op="${esc(c.operation_id)}"><td><b style="color:#fff">${esc(csName(c.operation_id))}</b> <span style="color:var(--muted)">${esc(CS_CN[sel[c.operation_id]?.c] || "")}</span></td>
     <td class="num mono">${fmt(c.ours_pond_count)} / ${fmt(c.prod_pond_count)}</td><td class="num mono">${fmt(c.ours_area_ha, 3)} / ${fmt(c.prod_area_ha, 3)}</td>
     <td>${c.match ? `<span class="cs-pill"><i style="background:#4cc27a"></i>identical</span>` : `<span class="cs-pill"><i style="background:#f2b84b"></i>one pixel apart</span>`}</td></tr>`).join("")}</tbody></table>`;
  document.querySelectorAll("#csChk tr.go").forEach((tr) => tr.onclick = () => csPick(tr.dataset.op, true));
}

function drawCsHeat() {
  const Y = CSD.years, S = CSD.sites.slice().sort((a, b) => a.c.localeCompare(b.c) || a.op.localeCompare(b.op));
  const x0 = 150, cw = 128, rh = 24, W = x0 + cw * Y.length + 110, H = 26 + S.length * rh + 52;
  const col = d3.scaleDiverging([0, 1, 2], (t) => d3.interpolateRgbBasis(["#e66767", "#2a2f36", "#5fa8ff"])(t)).clamp(true);
  let s = Y.map((y, j) => `<text x="${x0 + cw * j + cw / 2}" y="14" text-anchor="middle" font-size="11" font-weight="700">${y}</text>`).join("");
  let prevC = null;
  S.forEach((site, i) => { const yy = 22 + i * rh, m = d3.mean(site.years.filter((r) => !r.thin && r.img === "ok"), (r) => r.a) || 0;
    if (site.c !== prevC) { if (prevC) s += `<line x1="8" x2="${x0 + cw * Y.length}" y1="${yy - 2}" y2="${yy - 2}" stroke="rgba(255,255,255,.35)"/>`; prevC = site.c; }
    s += `<g class="row" data-op="${esc(site.op)}" style="cursor:pointer"><rect x="0" y="${yy}" width="${W}" height="${rh}" fill="${site.op === CS.op ? "rgba(255,255,255,.08)" : "transparent"}"/>
      <text class="lbl" x="${x0 - 10}" y="${yy + 15}" text-anchor="end" font-size="11" font-family="IBM Plex Mono" style="fill:${site.op === CS.op ? "#fff" : "rgba(236,241,238,.75)"}">${esc(csName(site.op))}${site.sel === "pilot_pick" ? " ◦" : ""}</text>`;
    Y.forEach((y, j) => { const r = site.years.find((q) => q.y === y), xx = x0 + cw * j + 2;
      if (!r || r.img !== "ok") { s += `<rect x="${xx}" y="${yy + 2}" width="${cw - 4}" height="${rh - 4}" rx="4" fill="url(#cshat)"/>`; return; }
      const rel = m ? r.a / m : 0;
      s += `<rect class="c" data-tip="${esc(csName(site.op))} · ${y}<br>${fmt(r.a)} m² in ${r.n} pond(s)<br>${rel ? rel.toFixed(2) + "× site average" : "no pond"}${r.thin ? "<br><span style='color:#f2b84b'>low imagery (" + (r.flag ? "Sentinel-2 SR archive gap" : (r.nvo ?? 0) + " clear days") + ")</span>" : ""}" x="${xx}" y="${yy + 2}" width="${cw - 4}" height="${rh - 4}" rx="4" fill="${r.a ? col(rel) : "#1b1f24"}" stroke="${r.thin ? "#f2b84b" : "none"}" stroke-dasharray="${r.thin ? "3 2" : ""}"/>` +
        `<text x="${xx + (cw - 4) / 2}" y="${yy + 15}" text-anchor="middle" font-size="10" font-family="IBM Plex Mono" style="pointer-events:none;fill:${r.a && Math.abs(rel - 1) > .55 ? "#fff" : "rgba(236,241,238,.7)"}">${r.a ? kfmt(r.a) : "0"}</text>`; });
    const ev = d3.rollup(site.events, (v) => v.length, (e) => e.cand);
    s += [...ev].map(([k, n], q) => `<circle cx="${x0 + cw * Y.length + 12 + q * 14}" cy="${yy + 11}" r="5" fill="${CS_EV[k][1]}"><title>${n} ${CS_EV[k][0]}</title></circle>`).join("") + `</g>`; });
  s = `<defs><pattern id="cshat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#14171b"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.18)" stroke-width="2"/></pattern></defs>` + s;
  s += `<text x="${x0 + cw * Y.length + 12}" y="14" font-size="10" style="fill:var(--muted)">Candidates</text>`;
  s += cbar(x0, H - 26, 300, col, 0, 2, [[0, "none"], [.5], [1, "average"], [1.5], [2, "2× +"]], "Pond area relative to the site's average", (v) => v.toFixed(1) + "×");
  const svg = $("#csHm"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
  svg.querySelectorAll(".row").forEach((g) => g.onclick = () => csPick(g.dataset.op, true));
  svg.querySelectorAll("rect.c").forEach((r) => { r.onmousemove = (e) => showTip(r.dataset.tip, e); r.onmouseleave = hideTip; });
  $("#csHmK").innerHTML = `<span><i style="background:url(#);background:repeating-linear-gradient(45deg,#14171b 0 3px,#3a3f46 3px 5px)"></i>no image</span><span><i style="border:1px dashed #f2b84b;background:transparent"></i>low-imagery year (excluded from the rules)</span><span>◦ pilot pick (no QC record)</span><span>● candidate types at the site</span>`;
}

function drawCsList() {
  const evs = Object.keys(CS_EV).filter((k) => CSD.sites.some((s) => s.events.some((e) => e.cand === k)));
  const list = CSD.sites.filter((s) => !CS.ev || s.events.some((e) => e.cand === CS.ev));
  $("#csList").innerHTML = `<select class="az-in" id="csEvF" style="width:100%"><option value="">All candidate types</option>${evs.map((k) => `<option value="${k}"${CS.ev === k ? " selected" : ""}>${CS_EV[k][0]}</option>`).join("")}</select>` +
    ["CHN", "USA"].map((c) => { const L = list.filter((s) => s.c === c); return L.length ? `<h4>${CS_CN[c]} · ${L.length}</h4>` + L.map((s) => {
      const n25 = (s.years.find((r) => r.y === 2025) || {}).n ?? 0, dots = [...new Set(s.events.map((e) => e.cand))].map((k) => `<i style="background:${CS_EV[k][1]}" title="${CS_EV[k][0]}"></i>`).join("");
      return `<div class="cs-it${s.op === CS.op ? " on" : ""}" data-op="${esc(s.op)}"><b>${esc(csName(s.op))}</b><span class="dots">${dots}</span>
        <small>${s.ponds.length} pond${s.ponds.length === 1 ? "" : "s"} tracked · ${n25} in 2025${s.sel === "pilot_pick" ? " · pilot pick" : ""}</small></div>`; }).join("") : ""; }).join("");
  $("#csEvF").onchange = (e) => { CS.ev = e.target.value; drawCsList(); };
  document.querySelectorAll("#csList .cs-it").forEach((el) => el.onclick = () => csPick(el.dataset.op));
}

function csPick(op, scroll) {
  CS.op = op; CS.pond = null; CS.year = 2025;
  drawCsList(); drawCsHeat(); drawCsSite();
  if (scroll) $("#cs-site").scrollIntoView({ behavior: "smooth" });
}

function drawCsSite() {
  const s = csSite(); if (!s) return;
  const qc = s.sel === "pilot_pick" ? "Pilot pick · no QC record" : `Reviewer: ${human(s.qc)} · ${human(s.feat)}${s.issue && s.issue !== "none" ? " · issue: " + human(s.issue) : ""}`;
  const fpt = s.fp_type === "tile_square" ? "tile square (no farm outline)" : "farm outline";
  $("#csDet").innerHTML = `
  <div class="card cs-head"><h2>${esc(csName(s.op))}</h2><span class="cs-tag">${esc(CS_CN[s.c])}</span><span class="cs-tag">${esc(qc)}</span><span class="cs-tag">Footprint: ${fpt}, ${fmt(s.fp_ha, 1)} ha</span>
    <span class="sp"></span>${hasImg(s.op) ? `<button class="cs-btn" id="csOpen">Open on the map</button>` : ""}</div>
  ${s.notes ? `<p class="say" style="margin:-6px 4px 12px">Reviewer note: “${esc(s.notes)}”</p>` : ""}
  <div class="az-grid">
    <div class="card s5"><div class="hd"><h3>Ponds on the ${CS.kind === "tci" ? "true-colour" : "BSI-E"} image</h3><span class="sp"></span><span class="note" id="csMapY"></span></div>
      <p class="say">Every pond ever detected, coloured by the first year it was seen; dashed line = footprint. Select a pond to follow it in the charts.</p><svg id="csMap" class="cs-map"></svg><div class="keys" id="csMapK"></div></div>
    <div class="card s7"><div class="hd"><h3>Pond area by year</h3></div><p class="say">One line per pond. Shaded years have low imagery and are left out of the rules.</p><svg id="csArea"></svg></div>
    <div class="card s12"><div class="hd"><h3>Presence by year</h3></div><p class="say">Each row is one pond. A filled dot means the pond was detected that summer (size = area); a ring means it was not. The last column is the rule's candidate and suggestion.</p><svg id="csPres" class="cs-grid"></svg></div>
    <div class="card s12"><div class="hd"><h3>Yearly images</h3><span class="sp"></span><span class="seg" id="csKind"><button data-k="tci" class="${CS.kind === "tci" ? "on" : ""}">True colour</button><button data-k="bsi" class="${CS.kind === "bsi" ? "on" : ""}">BSI-E</button></span></div>
      <p class="say">One summer composite per year. BSI-E is shown inside the footprint only, where ponds are searched (blue = below the 0.30 pond threshold; black outlines = ponds found that year). Select a year to show it above.</p><div class="cs-strip" id="csStrip"></div></div>
    <div class="card s12"><div class="hd"><h3>Candidate changes at this site</h3></div><div id="csEvt"></div></div>
  </div>`;
  if ($("#csOpen")) $("#csOpen").onclick = () => openFarm(s.op);
  document.querySelectorAll("#csKind button").forEach((b) => b.onclick = () => { CS.kind = b.dataset.k; drawCsSite(); });
  drawCsMap(s); drawCsArea(s); drawCsPres(s); drawCsStrip(s); drawCsEvt(s);
}

function csHL() {   // highlight the selected pond everywhere
  const p = CS.pond;
  document.querySelectorAll("#csMap .pd").forEach((e) => { e.setAttribute("fill-opacity", !p || e.dataset.id === p ? .55 : .12); e.setAttribute("stroke-width", e.dataset.id === p ? 2.6 : 1.4); });
  document.querySelectorAll("#csArea .pl").forEach((e) => { e.setAttribute("stroke-opacity", !p || e.dataset.id === p ? 1 : .15); e.setAttribute("stroke-width", e.dataset.id === p ? 3 : 1.8); });
  document.querySelectorAll("#csPres .row").forEach((e) => e.style.opacity = !p || e.dataset.id === p ? 1 : .35);
}
const csSel = (id) => { CS.pond = CS.pond === id ? null : id; csHL(); };

function drawCsMap(s) {
  const svg = $("#csMap");
  if (!s.bounds) { svg.outerHTML = `<p class="say">No image for this site.</p>`; return; }
  const [[S0, W0], [N0, E0]] = s.bounds, kx = Math.cos((S0 + N0) / 2 * Math.PI / 180), W = 420, H = Math.round(W * (N0 - S0) / ((E0 - W0) * kx));
  const px = ([lon, lat]) => [((lon - W0) / (E0 - W0) * W).toFixed(1), ((N0 - lat) / (N0 - S0) * H).toFixed(1)], pth = (r) => "M" + r.map(px).join("L") + "Z";
  const yr = s.years.find((r) => r.y === CS.year);
  let h = `<image href="${csImg(s.op, CS.year, CS.kind)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>
    <path d="${pth(s.fp)}" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="6 4" opacity=".85"/>`;
  s.ponds.slice().sort((a, b) => (b.max || 0) - (a.max || 0)).forEach((p) => {
    const c = csYearCol(p.first || 2025), i = s.years.findIndex((r) => r.y === CS.year), on = i >= 0 && p.area[i] > 0;
    h += `<path class="pd" data-id="${esc(p.id)}" d="${pth(p.ring)}" fill="${c}" fill-opacity=".55" stroke="${c}" stroke-width="1.4" stroke-dasharray="${on ? "" : "3 2"}"/>`; });
  s.ponds.forEach((p) => { const cx = d3.mean(p.ring, (q) => +px(q)[0]), cy = d3.min(p.ring, (q) => +px(q)[1]) - 4;
    h += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="10" font-weight="700" style="fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.75);stroke-width:3px;pointer-events:none">${p.short}</text>`; });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = h;
  $("#csMapY").textContent = `${CS.year}${yr ? ` · ${fmt(yr.a)} m² in ${yr.n} pond(s)` : ""}`;
  svg.querySelectorAll(".pd").forEach((e) => { const p = s.ponds.find((q) => q.id === e.dataset.id);
    e.onclick = () => csSel(p.id);
    e.onmousemove = (ev) => showTip(`<b>${p.short}</b> · first seen ${p.first}${p.last && p.last !== p.first ? `, last ${p.last}` : ""}<br>detected in ${p.nyr} of ${s.years.length} summers · peak ${fmt(p.max)} m²<br><span style="color:var(--muted)">dashed outline: not detected in ${CS.year}</span>`, ev);
    e.onmouseleave = hideTip; });
  const fy = [...new Set(s.ponds.map((p) => p.first))].sort();
  $("#csMapK").innerHTML = fy.map((y) => `<span><i style="background:${csYearCol(y)}"></i>first seen ${y}</span>`).join("") + `<span><i style="border:1px dashed #fff;background:transparent"></i>footprint</span>`;
  csHL();
}

function drawCsArea(s) {
  const W = 560, H = 330, m = { l: 52, r: 14, t: 10, b: 34 }, Y = s.years.map((r) => r.y);
  const x = d3.scaleLinear([Y[0], Y[Y.length - 1]], [m.l, W - m.r]), mx = d3.max(s.ponds, (p) => d3.max(p.area)) || 1, y = d3.scaleLinear([0, mx * 1.08], [H - m.b, m.t]).nice();
  let h = s.years.filter((r) => r.thin || r.img !== "ok").map((r) => `<rect x="${x(r.y) - 14}" y="${m.t}" width="28" height="${H - m.b - m.t}" fill="rgba(242,184,75,.13)"/>`).join("");
  h += y.ticks(5).map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.08)"/><text x="${m.l - 6}" y="${y(t) + 3}" text-anchor="end" font-size="10">${kfmt(t)}</text>`).join("");
  h += Y.map((t) => `<text x="${x(t)}" y="${H - m.b + 14}" text-anchor="middle" font-size="10">${t}</text>`).join("");
  h += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="rgba(255,255,255,.3)"/><line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.3)"/>`;
  h += `<text class="axt" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle" font-size="10">Summer (year)</text><text class="axt" transform="translate(12,${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle" font-size="10">Pond area (m²)</text>`;
  h += `<line id="csYr" x1="${x(CS.year)}" x2="${x(CS.year)}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.45)" stroke-dasharray="3 3"/>`;
  s.ponds.forEach((p) => { const c = csYearCol(p.first || 2025), pts = p.area.map((v, i) => [x(Y[i]), v == null ? null : y(v)]);
    h += `<path class="pl" data-id="${esc(p.id)}" d="${d3.line().defined((d) => d[1] != null).curve(d3.curveMonotoneX)(pts)}" fill="none" stroke="${c}" stroke-width="1.8" style="cursor:pointer"/>` +
      pts.map((q, i) => q[1] == null ? "" : `<circle cx="${q[0]}" cy="${q[1]}" r="${p.area[i] > 0 ? 2.4 : 1.4}" fill="${p.area[i] > 0 ? c : "rgba(255,255,255,.35)"}" style="pointer-events:none"/>`).join(""); });
  const svg = $("#csArea"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = h;
  svg.querySelectorAll(".pl").forEach((e) => { const p = s.ponds.find((q) => q.id === e.dataset.id);
    e.onclick = () => csSel(p.id); e.onmousemove = (ev) => showTip(`<b>${p.short}</b> · peak ${fmt(p.max)} m² · first seen ${p.first}`, ev); e.onmouseleave = hideTip; });
  csHL();
}

function drawCsPres(s) {
  const Y = s.years, x0 = 70, cw = 82, rh = 26, x1 = x0 + cw * Y.length, W = x1 + 330, H = 30 + s.ponds.length * rh + 6;
  const mx = d3.max(s.ponds, (p) => d3.max(p.area)) || 1, r = d3.scaleSqrt([0, mx], [2.5, 9.5]);
  const evOf = Object.fromEntries(s.events.map((e) => [e.pond, e]));
  let h = Y.map((q, j) => `<text x="${x0 + cw * j + cw / 2}" y="14" text-anchor="middle" font-size="11" font-weight="700" style="fill:${q.thin || q.img !== "ok" ? "#f2b84b" : "rgba(236,241,238,.8)"}">${q.y}</text>` +
    ((q.thin || q.img !== "ok") ? `<rect x="${x0 + cw * j + 3}" y="20" width="${cw - 6}" height="${s.ponds.length * rh + 4}" rx="6" fill="rgba(242,184,75,.08)"/>` : "")).join("");
  h += `<text x="${x1 + 12}" y="14" font-size="11" font-weight="700">Rule candidate · suggestion</text>`;
  s.ponds.forEach((p, i) => { const yy = 24 + i * rh, c = csYearCol(p.first || 2025), e = evOf[p.id];
    h += `<g class="row" data-id="${esc(p.id)}" style="cursor:pointer"><rect x="0" y="${yy}" width="${W}" height="${rh}" fill="transparent"/>
      <text class="lbl" x="${x0 - 12}" y="${yy + 16}" text-anchor="end" font-size="11.5" font-weight="700" style="fill:rgba(236,241,238,.85)">${p.short}</text>
      <line x1="${x0 + 8}" x2="${x1 - 8}" y1="${yy + 12}" y2="${yy + 12}" stroke="rgba(255,255,255,.1)"/>`;
    Y.forEach((q, j) => { const v = p.area[j], cx = x0 + cw * j + cw / 2;
      if (q.img !== "ok") h += `<text x="${cx}" y="${yy + 16}" text-anchor="middle" font-size="11" style="fill:rgba(255,255,255,.3)">×</text>`;
      else if (v > 0) h += `<circle class="c" cx="${cx}" cy="${yy + 12}" r="${r(v)}" fill="${c}"><title>${p.short} ${q.y}: ${fmt(v)} m²</title></circle>`;
      else h += `<circle cx="${cx}" cy="${yy + 12}" r="3.2" fill="none" stroke="rgba(255,255,255,.35)"><title>${p.short} ${q.y}: not detected</title></circle>`; });
    h += e ? `<circle cx="${x1 + 17}" cy="${yy + 12}" r="5" fill="${CS_EV[e.cand][1]}"/><text x="${x1 + 28}" y="${yy + 16}" font-size="11.5" style="fill:#fff">${CS_EV[e.cand][0]}${e.sug ? ` <tspan style="fill:var(--muted)">· ${CS_SUG[e.sug] || human(e.sug)}${e.year ? " " + e.year : ""}</tspan>` : ""}</text>`
      : `<text x="${x1 + 12}" y="${yy + 16}" font-size="11" style="fill:var(--muted)">stable · no candidate</text>`;
    h += `</g>`; });
  const svg = $("#csPres"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = h;
  svg.querySelectorAll(".row").forEach((g) => g.onclick = () => csSel(g.dataset.id));
  csHL();
}

function drawCsStrip(s) {
  $("#csStrip").innerHTML = s.years.map((r) => {
    const ok = r.img === "ok", warn = r.thin ? (r.flag ? "archive gap" : "low imagery") : "";
    return `<div class="cs-th${r.y === CS.year ? " on" : ""}" data-y="${r.y}"><div class="im" ${ok ? `style="background-image:url('${csImg(s.op, r.y, CS.kind)}')"` : ""}>${ok ? "" : "no image"}</div>
      <div class="cap"><b>${r.y}</b>${r.n} pond${r.n === 1 ? "" : "s"}${warn ? `<span class="w" title="${r.nvo ?? 0} clear days per pixel">${warn}</span>` : `<span style="margin-left:auto;color:var(--muted)">${r.nvo ?? "–"} d</span>`}</div></div>`; }).join("");
  document.querySelectorAll("#csStrip .cs-th").forEach((t) => t.onclick = () => {
    CS.year = +t.dataset.y; document.querySelectorAll("#csStrip .cs-th").forEach((q) => q.classList.toggle("on", q === t)); drawCsMap(s);
    const x = $("#csYr"); if (x) { const Y = s.years.map((q) => q.y), xx = 52 + (CS.year - Y[0]) / (Y[Y.length - 1] - Y[0]) * (560 - 14 - 52); x.setAttribute("x1", xx); x.setAttribute("x2", xx); } });
}

function drawCsEvt(s) {
  if (!s.events.length) { $("#csEvt").innerHTML = `<p class="say">Every pond at this site is stable or too short-lived for a rule; no candidate changes.</p>`; return; }
  const seq = (t) => (t || "").split(" ").map((c) => { const y = c.slice(0, 2), m = c.slice(2);
    const st = m.startsWith("#") ? ["#4cc27a", "present"] : m.startsWith("x") ? ["#555", "no image"] : ["rgba(255,255,255,.25)", "absent"];
    return `<span title="20${y}: ${st[1]}${m.includes("?") ? ", low imagery" : ""}" style="display:inline-block;width:14px;height:14px;margin-right:2px;border-radius:3px;background:${st[0]};${m.includes("?") ? "outline:1px dashed #f2b84b;outline-offset:-1px" : ""}"></span>`; }).join("");
  $("#csEvt").innerHTML = `<table class="az-tbl"><thead><tr><th>Pond</th><th>Rule candidate</th><th>Suggested label</th><th>Year</th><th class="num">Peak area m²</th><th>Presence ${CSD.years[0]}–${CSD.years[CSD.years.length - 1]}</th><th>What the rule means</th></tr></thead><tbody>${s.events.map((e) =>
    `<tr class="go" data-id="${esc(e.pond)}"><td><b style="color:#fff">${e.short}</b></td><td><span class="cs-pill"><i style="background:${CS_EV[e.cand][1]}"></i>${CS_EV[e.cand][0]}</span></td>
     <td>${e.sug ? esc(CS_SUG[e.sug] || human(e.sug)) : "<span style='color:var(--muted)'>check true colour</span>"}</td><td class="mono">${e.year ?? "–"}</td><td class="num mono">${fmt(e.max)}</td>
     <td>${seq(e.seq)}</td><td style="color:var(--muted);font-size:12px">${CS_EV[e.cand][2]}</td></tr>`).join("")}</tbody></table>
    <p class="say" style="margin-top:8px">These are suggestions for a reviewer, not labels. A reviewer confirms each one against true colour (docs/labeling_protocol.md).</p>`;
  document.querySelectorAll("#csEvt tr.go").forEach((tr) => tr.onclick = () => csSel(tr.dataset.id));
}

function drawCsLim(st) {
  const L = [
    ["#f2b84b", "China footprints are tile squares", "China has no farm outlines, so the search area is a square around the farm point. Dark ground near the farm can count as pond (flooding at chn-82b678 in 2019 and 2021 reads as up to 63,000 m²)."],
    ["#f2b84b", "China 2017–2018 have little imagery", "Sentinel-2 surface reflectance did not cover China fully until late 2018. Those years are kept but flagged and left out of the rules."],
    ["#5fa8ff", "One composite per summer", "Short-lived ponds and changes within a season are smoothed; an event can only be placed to the year. The monthly view on the map shows how much a pond varies within a year."],
    ["#5fa8ff", "Small ponds are fragile", "Ponds of 5–11 pixels flip in and out near the 0.30 threshold, which produces many single-year and transient candidates."],
    ["#e66767", "Detected is not the same as present", "usa-ks-636793 is confirmed for 2025, but its ponds are detected only in 2019, 2023 and 2025: a real pond that is often dry can look transient."],
    ["#e66767", "Ponds clipped by the footprint", "Ponds are searched inside the footprint only; a pond crossing its edge is cut (usa-ks-2c3301 P04). The BSI-E images show the footprint for this reason."]];
  $("#csLim").innerHTML = L.map(([c, t, d]) => `<div class="find"><i style="background:${c};color:${c}"></i><div><b>${t}.</b> ${d}</div></div>`).join("");
}

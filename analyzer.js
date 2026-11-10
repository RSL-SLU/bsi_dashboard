"use strict";
// ============================================================================ Analyzer tab + seasonal cards
// Loaded after index_v1's main script; uses its globals (d3, $, esc, fmt, human, titleCase, COUNTRIES, PREC, DASH, PTS,
// goFarm, goCountry, goState, showTip, hideTip, pcol, QCC, LN_ANIM, LN_T, ballSvg, dotAnim, lineKey, S).
let ANZ = null, MONTHLY = {};
const AZ = { pcSel: new Set(), region: "", mode: "p", hide: new Set(), sx: 10, sy: 13, page: 0, sort: ["area", -1], q: "", cls: "", built: false, brush: {} };
const CLS = [["manure_pond", "True manure pond", "#4cc27a"], ["possible_manure", "Possible manure", "#e0a526"], ["wet_runoff", "Wet runoff", "#5fa8ff"],
  ["other_water", "Natural water", "#b3a6ff"], ["other_fp", "Other false positive", "#e66767"]];
const CLSC = Object.fromEntries(CLS.map(([k, , c]) => [k, c])), CLSN = Object.fromEntries(CLS.map(([k, n]) => [k, n]));
const BNAME = { B2: "Blue", B3: "Green", B4: "Red", B5: "Red edge 1", B6: "Red edge 2", B7: "Red edge 3", B8: "NIR", B8A: "NIR narrow", B11: "SWIR 1", B12: "SWIR 2" };
const INAME = { bsi_e: "BSI-E", ndvi: "NDVI", ndwi: "NDWI", mndwi: "MNDWI", ndci: "NDCI" };
const BSI_BANDS = ["B8A", "B11"];   // BSI-E = f(B11) + f(B8A)
const MON = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"], MONL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEAS = { USA: "#5fa8ff", CAN: "#e66767", CHN: "#f2b84b", DEU: "#ffffff", FRA: "#b3a6ff", TUR: "#ec8454", AUS: "#4cc27a", NZL: "#7fd6c2", RUS: "#9aa29c" };
const YCOL = { 2023: "#5fa8ff", 2024: "#b3a6ff", 2025: "#ec8454" };

// features: 0-9 bands, 10-14 indices (polygon), 15-19 index contrast (polygon − ring), 20 log10 area
function feats() {
  const B = ANZ.bands, I = ANZ.idx, out = [];
  B.forEach((b, i) => out.push({ k: b, name: `${b} ${BNAME[b]}`, f: (p) => p.p[i] }));
  I.forEach((n, j) => out.push({ k: n, name: INAME[n], f: (p) => p.p[10 + j] }));
  I.forEach((n, j) => out.push({ k: "d_" + n, name: `Δ${INAME[n]} vs ring`, f: (p) => p.p[10 + j] != null && p.r[10 + j] != null ? p.p[10 + j] - p.r[10 + j] : null }));
  out.push({ k: "area", name: "Area (log m²)", f: (p) => p.area > 0 ? Math.log10(p.area) : null });
  return out;
}
let FEATS = [];

// ---------------------------------------------------------------------------- small stats helpers
const q = (a, p) => a.length ? d3.quantileSorted(a, p) : null;
const sorted = (a) => a.filter((v) => v != null && isFinite(v)).sort(d3.ascending);
function auc(a, b) {   // P(b > a) + .5 P(tie)
  if (!a.length || !b.length) return null;
  let s = 0; for (const x of a) for (const y of b) s += y > x ? 1 : y === x ? .5 : 0;
  return s / (a.length * b.length);
}
function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}
function kde(vals, xs, bw) {
  const k = (u) => Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
  return xs.map((x) => [x, d3.mean(vals, (v) => k((x - v) / bw)) / bw]);
}
const inRegion = (r) => !AZ.region || r === AZ.region || r.startsWith(AZ.region + "/") || (AZ.region === "USA" && r.startsWith("USA"));
const lab = () => ANZ.polys.filter((p) => p.cls !== "unlabelled" && inRegion(p.region) && !AZ.hide.has(p.cls));
const labAll = () => ANZ.polys.filter((p) => p.cls !== "unlabelled" && inRegion(p.region));
const regionName = (r) => r.startsWith("USA/") ? titleCase(r.split("/")[1]) : COUNTRIES[r] ? COUNTRIES[r].name : r === "USA" ? "United States" : r;
const hasImg = (op) => PTS.some((p) => p.op === op && p.img);
const clsKeys = (P, extra = "") => { const n = d3.rollup(P, (v) => v.length, (p) => p.cls);
  return CLS.filter(([k]) => n.get(k)).map(([k, name, c]) => `<span><i style="background:${c};border-radius:50%;box-shadow:0 0 6px ${c}"></i>${name} <span class="mono" style="color:var(--muted)">${n.get(k)}</span></span>`).join("") + extra; };
function cbar(x, y, w, col, d0, d1, ticks, title, fmtv = (v) => v) {   // svg colour bar with ticks
  const id = "cb" + Math.random().toString(36).slice(2, 8), st = d3.range(11).map((i) => `<stop offset="${i / 10}" stop-color="${col(d0 + (d1 - d0) * i / 10)}"/>`).join("");
  return `<defs><linearGradient id="${id}">${st}</linearGradient></defs><text x="${x}" y="${y - 4}" font-size="10" font-weight="700" style="fill:rgba(236,241,238,.6)">${title}</text>
    <rect x="${x}" y="${y}" width="${w}" height="9" rx="4.5" fill="url(#${id})" stroke="rgba(255,255,255,.25)"/>` +
    ticks.map(([v, l]) => { const xx = x + w * (v - d0) / (d1 - d0); return `<line x1="${xx}" x2="${xx}" y1="${y + 9}" y2="${y + 13}" stroke="rgba(255,255,255,.5)"/><text x="${xx}" y="${y + 23}" text-anchor="middle" font-size="9.5">${fmtv(v)}${l ? ` <tspan style="fill:rgba(236,241,238,.5)">${l}</tspan>` : ""}</text>`; }).join("");
}
const pidName = (p) => `${p.op} ${p.pid.split("_").pop()}`, opShort = (op) => op.startsWith("usa-") ? op : op.split("-").slice(0, 2).join("-");
const kfmt = (v) => v == null ? "–" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1) + "k" : fmt(v);

// ---------------------------------------------------------------------------- styles
document.head.insertAdjacentHTML("beforeend", `<style>
.nav .tabs{display:inline-flex;gap:2px;padding:2px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.06)}
.nav .tabs button{all:unset;cursor:pointer;padding:4px 13px;border-radius:999px;font:600 12px var(--fb);color:var(--ink2);letter-spacing:.02em}
.nav .tabs button:hover{background:rgba(255,255,255,.1)}
.nav .tabs button.on{background:rgba(255,255,255,.9);color:#15181b}
body.anz #lcol,body.anz #rcol,body.anz #mid,body.anz #leg,body.anz #time,body.anz .leaflet-control-container,body.anz #step,body.anz .crumbs{display:none!important}
#anz{position:fixed;inset:52px 0 0 0;z-index:950;overflow-y:auto;scrollbar-width:thin;padding:16px 18px 40px;
  background:radial-gradient(1200px 700px at 15% -10%,rgba(236,132,84,.10),transparent 60%),radial-gradient(900px 600px at 100% 20%,rgba(95,168,255,.08),transparent 60%),rgba(9,10,12,.72);
  backdrop-filter:blur(30px) saturate(140%);-webkit-backdrop-filter:blur(30px) saturate(140%)}
#anz .wrap{max-width:1560px;margin:0 auto}
.az-top{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.az-top h1{margin:0;font:800 34px/1 var(--fd);font-stretch:72%;letter-spacing:.005em}
.az-top .sub{color:var(--muted);font-size:13px;margin-left:2px}
.az-top .sp{flex:1}
.az-top select{font:500 12px var(--fm);color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.26);border-radius:9px;padding:5px 8px;outline:none}
.az-top select option{background:#1b1e22}
.az-jump{display:flex;gap:6px;flex-wrap:wrap}
.az-jump a{cursor:pointer;font:600 11.5px var(--fb);padding:4px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:var(--ink2);background:rgba(255,255,255,.04)}
.az-jump a:hover{background:rgba(255,255,255,.12);color:#fff}
.az-sec{display:flex;align-items:baseline;gap:10px;margin:22px 2px 10px}
.az-sec h2{margin:0;font:800 22px/1 var(--fd);font-stretch:74%}
.az-sec span{color:var(--muted);font-size:12.5px}
.az-sec i{font:600 10.5px var(--fm);font-style:normal;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.3);color:var(--ink2)}
.az-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
.az-grid>.card{padding:14px 16px}
.s3{grid-column:span 3}.s4{grid-column:span 4}.s5{grid-column:span 5}.s6{grid-column:span 6}.s7{grid-column:span 7}.s8{grid-column:span 8}.s12{grid-column:span 12}
@media (max-width:1200px){.s3,.s4,.s5{grid-column:span 6}.s6,.s7,.s8{grid-column:span 12}}
@media (max-width:760px){.az-grid>.card{grid-column:span 12}}
.az-grid svg{width:100%;height:auto;display:block}
.az-grid svg text{fill:rgba(236,241,238,.75);font-family:var(--fb)}
.az-grid .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}
.az-grid .hd h3{margin:0}
.az-grid .hd .sp{flex:1}
.az-grid .seg button{padding:3px 10px;font-size:11.5px}
.az-f4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
@media (max-width:1100px){.az-f4{grid-template-columns:repeat(2,minmax(0,1fr))}}
.az-f4 .f4{cursor:pointer;padding:14px 16px;transition:transform .15s,border-color .15s}
.az-f4 .f4:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.45)}
.az-f4 .k{font:700 10.5px var(--fb);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.az-f4 .v{font:800 40px/1.05 var(--fd);font-stretch:72%;margin:4px 0 2px;text-shadow:0 0 18px currentColor}
.az-f4 .s{font-size:13px;color:var(--ink2);line-height:1.4}
.az-sec h2 em{font:700 13px var(--fm);font-style:normal;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;margin-right:9px;vertical-align:3px;background:var(--accent);color:#15181b}
.az-ring{display:grid;grid-template-columns:230px 1fr;gap:18px;align-items:center;margin-bottom:12px;padding:14px 18px}
.az-ring .ringfig{width:230px;height:auto}
.az-ring .say{margin:4px 0}
@media (max-width:760px){.az-ring{grid-template-columns:1fr}}
.az-more{margin-top:12px}
.az-more>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:8px;font:600 12px var(--fb);color:var(--ink2);padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.05)}
.az-more>summary::-webkit-details-marker{display:none}
.az-more>summary::before{content:"+";font:700 13px var(--fm);color:var(--accent)}
.az-more[open]>summary::before{content:"−"}
.az-more>summary:hover{background:rgba(255,255,255,.12);color:#fff}
.az-more>.az-grid{margin-top:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px}
.chip{cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:600 11.5px var(--fb);padding:3px 10px 3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:var(--ink2);user-select:none}
.chip i{width:9px;height:9px;border-radius:50%}
.chip.off{opacity:.38}
.chip small{font:500 10.5px var(--fm);color:var(--muted)}
.find{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,.09);color:var(--ink2);font-size:13px}
.find:first-of-type{border-top:0}
.find i{width:12px;height:12px;border-radius:50%;margin-top:3px;box-shadow:0 0 10px currentColor}
.find b{color:#fff}
.az-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.az-tbl th{font:700 10.5px var(--fb);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.18);cursor:pointer;white-space:nowrap;position:sticky;top:0;background:rgba(20,22,26,.85)}
.az-tbl th.num,.az-tbl td.num{text-align:right}
.az-tbl td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);color:var(--ink2);white-space:nowrap}
.az-tbl tr.go{cursor:pointer}
.az-tbl tr.go:hover td{background:rgba(255,255,255,.06);color:#fff}
.az-tbl td.mono{font-family:var(--fm);font-size:11.5px}
.az-tbl .pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px}
.az-tbl .pill i{width:8px;height:8px;border-radius:50%}
.az-tbl .bar{display:inline-block;height:7px;border-radius:4px;vertical-align:middle;margin-right:6px}
.tblwrap{max-height:520px;overflow:auto;scrollbar-width:thin;border-radius:10px}
.pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px;font:500 11.5px var(--fm);color:var(--muted)}
.pager button{all:unset;cursor:pointer;padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.25);color:#fff}
.pager button:disabled{opacity:.3;cursor:default}
.az-in{font:500 12px var(--fm);color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.26);border-radius:9px;padding:4px 8px;outline:none;width:190px}
.case{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.case .cs{cursor:pointer;border-radius:12px;padding:9px 10px 6px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02));transition:transform .15s,border-color .15s}
.case .cs:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.45)}
.case .cs .t{display:flex;gap:6px;align-items:baseline;font:600 11.5px var(--fm);color:#fff}
.case .cs .t span{margin-left:auto;font:500 10.5px var(--fb);color:var(--muted)}
.case .cs .m{font-size:11.5px;color:var(--muted)}
.season .hm rect.c:hover{stroke:#fff;stroke-width:1}
.sfarms{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.sfarms span{cursor:pointer;font:500 10.5px var(--fm);padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:var(--ink2)}
.sfarms span:hover{background:rgba(255,255,255,.12);color:#fff}
.azlink{cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:600;color:#fff}
.azlink:hover{background:linear-gradient(145deg,rgba(255,255,255,.22),rgba(255,255,255,.06)),rgba(18,20,24,.4)}
.azlink span{margin-left:auto;font:500 11px var(--fm);color:var(--muted)}
</style>`);

// ---------------------------------------------------------------------------- tab plumbing
$(".nav .brand").insertAdjacentHTML("afterend", `<span class="tabs" id="tabs"><button data-t="map" class="on">Map</button><button data-t="anz">Analyzer</button></span>`);
document.body.insertAdjacentHTML("beforeend", `<main id="anz" hidden><div class="wrap" id="anzw"><p class="say">Loading…</p></div></main>`);
function setTab(t, region) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  document.body.classList.toggle("anz", t === "anz"); $("#anz").hidden = t !== "anz";
  if (t === "anz") {
    if (region !== undefined) AZ.region = region;
    ANZ_READY.then(() => { buildAnalyzer(); $("#anz").scrollTop = 0; });
  }
}
document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => setTab(b.dataset.t));
const openFarm = (op) => { if (!hasImg(op)) return; setTab("map"); goFarm(op); };

const ANZ_READY = d3.json("analyzer.json").then((d) => {
  ANZ = d; FEATS = feats();
  (d.monthly || []).forEach((m) => { MONTHLY[m.operation_id] = m; });
  if (typeof S !== "undefined" && S.view !== "farm" && typeof refreshRcol === "function") refreshRcol();
  if (typeof S !== "undefined" && S.view === "farm" && S.op) fillSeason(S.op);
}).catch((e) => { console.error("analyzer.json", e); ANZ = null; });

// ---------------------------------------------------------------------------- page
function buildAnalyzer() {
  if (!ANZ) { $("#anzw").innerHTML = `<p class="say">analyzer.json is missing: run scripts/analyzer_data.py.</p>`; return; }
  const regs = [...new Set(ANZ.ops.map((o) => o.region))], cs = [...new Set(regs.map((r) => r.split("/")[0]))].sort((a, b) => regionName(a).localeCompare(regionName(b)));
  const opts = [`<option value="">All regions</option>`].concat(cs.flatMap((c) => [`<option value="${c}"${AZ.region === c ? " selected" : ""}>${esc(regionName(c))}</option>`]
    .concat(c === "USA" ? regs.filter((r) => r.startsWith("USA/")).sort().map((r) => `<option value="${r}"${AZ.region === r ? " selected" : ""}>&nbsp;&nbsp;${esc(regionName(r))}</option>`) : [])));
  $("#anzw").innerHTML = `
  <div class="az-top"><div><h1>Analyzer</h1><div class="sub">How accurate BSI pond detection is, what the false detections are, and how ponds change over time</div></div>
    <span class="sp"></span><div class="az-jump"><a data-j="qc">Accuracy</a><a data-j="fp">False detections</a><a data-j="cs">Case study</a><a data-j="pl">Data explorer</a></div>
    <select id="azReg" title="Region">${opts.join("")}</select></div>
  <div class="az-f4" id="azKpi"></div>

  <div class="az-sec" id="sec-qc"><h2><em>1</em>How accurate is BSI?</h2><span>Reviewer verdicts on the QC sample</span></div>
  <div class="az-grid">
    <div class="card s6"><h3>Detection precision by region</h3><p class="say" id="azPrSay"></p><svg id="azPr"></svg><p class="note">● Precision = correct ÷ (correct + incorrect) for BSI detections; ◇ agreement on farms where BSI detected no pond. Whiskers: Wilson 95% interval. Regions with at least 10 reviewed detections; select a row to open the region.</p></div>
    <div class="card s6"><h3>Detection outcome flow</h3><p class="say">BSI output, reviewer verdict and the surface type recorded by reviewers.</p><svg id="azSk"></svg></div>
  </div>
  <details class="az-more"><summary>Detailed QC statistics · issues, pond size, region table</summary><div class="az-grid">
    <div class="card s5"><h3>Reviewer-flagged issues</h3><p class="say">Share of reviewed farms in each region with the issue; cell values are counts.</p><svg id="azIs"></svg></div>
    <div class="card s7"><h3>2025 pond size distribution at correctly detected farms</h3><p class="say" id="azRgSay"></p><svg id="azRg"></svg></div>
    <div class="card s12"><h3>Region comparison</h3><div class="tblwrap" id="azTbl"></div></div>
  </div></details>

  <div class="az-sec" id="sec-fp"><h2><em>2</em>What are the false detections?</h2><span>Reviewer-labelled false positives compared with confirmed manure ponds, Sentinel-2 2025</span></div>
  <div class="card az-ring"><svg viewBox="0 0 230 120" class="ringfig"><rect x="6" y="8" width="218" height="104" rx="22" fill="rgba(236,132,84,.14)" stroke="#ec8454" stroke-dasharray="5 4"/><path d="M70 38 C92 26 140 28 160 40 C176 50 170 78 150 84 C120 92 84 90 68 78 C56 68 56 46 70 38Z" fill="rgba(57,135,229,.55)" stroke="#9fd0ff" stroke-width="1.6"/><text x="113" y="60" text-anchor="middle" font-size="11" font-weight="700" style="fill:#fff">pond polygon</text><text x="113" y="73" text-anchor="middle" font-size="8.5" style="fill:#d6e8ff">(BSI detection)</text><path d="M20 70 C24 60 40 58 46 66 C52 74 44 92 32 92 C22 92 16 80 20 70Z" fill="#0d1117" stroke="#9fd0ff" stroke-width="1" stroke-dasharray="2 2"/><text x="33" y="104" text-anchor="middle" font-size="7.5" style="fill:#d6e8ff">other pond (excluded)</text><text x="113" y="24" text-anchor="middle" font-size="10" font-weight="700" style="fill:#ffb48f">100 m ring</text><path d="M171 62 H222" stroke="#ffb48f" stroke-width="1.2" marker-start="url(#rga)" marker-end="url(#rga)"/><text x="197" y="56" text-anchor="middle" font-size="9" style="fill:#ffb48f">100 m</text><defs><marker id="rga" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L6 3L0 6z" fill="#ffb48f"/></marker></defs></svg><div><h3>Reading the comparison: pond polygon and 100 m ring</h3>
      <p class="say">A <b>polygon</b> is one pond outline detected by BSI in 2025 (not the farm footprint; a farm can contain several). Each polygon is measured twice: inside the polygon, and in a <b>100 m wide band of land surrounding it</b> (the ring), which represents the local background such as pens, bare soil or fields. <b>Every pond polygon on the farm is cut out of the ring</b>, so neighbouring ponds are not counted as background.
      <b>Polygon − ring</b> shows how strongly a feature stands out from its own surroundings, which removes much of the regional difference in background.</p>
      <p class="say">A confirmed manure pond is far darker and wetter than the dry ground around it (median BSI-E decrease ≈ 2.5). A damp patch of field differs little from its surroundings. In the charts below, the ring appears as the <b>100 m ring</b> and <b>Polygon − ring</b> views of the spectral signature, the ◇ marker on the violins, and the <b>Δ … vs ring</b> rows of the separability table.</p></div></div>
  <div class="chips" id="azCls"></div>
  <div class="az-grid">
    <div class="card s8"><div class="hd"><h3>Spectral signature by class</h3><span class="sp"></span><span class="seg" id="azMode"><button data-m="p" class="on">Polygon</button><button data-m="r">100 m ring</button><button data-m="d">Polygon − ring</button></span></div>
      <p class="say" id="azSigSay"></p><svg id="azSig"></svg><div class="keys" id="azSigK"></div><p class="note">Lines show class medians; shading shows the interquartile range. <b style="color:#ffb48f">Orange columns mark B8A (narrow NIR) and B11 (SWIR 1), the inputs to BSI-E.</b> The wavelength axis is broken between NIR and SWIR.</p></div>
    <div class="card s4"><h3>Key separability findings</h3><div id="azFind"></div></div>
  </div>
  <details class="az-more"><summary>Detailed spectral statistics · separability, feature space, distributions</summary><div class="az-grid">
    <div class="card s5"><div class="hd"><h3>Separability against confirmed ponds</h3></div><p class="say">Area under the ROC curve per feature (0.5 = no separation, 1.0 = complete separation). ▲/▼: false-positive class higher/lower than confirmed ponds. <b style="color:#ffb48f">●</b> BSI-E and its input bands.</p><svg id="azAuc"></svg></div>
    <div class="card s7"><div class="hd"><h3>Feature space</h3><span class="sp"></span><select class="az-in" id="azSx" style="width:auto"></select><span class="note">vs</span><select class="az-in" id="azSy" style="width:auto"></select></div>
      <p class="say">Kernel density contours per class with individual labelled polygons. Select a point to open the farm.</p><svg id="azSc"></svg><div class="keys" id="azScK"></div></div>
    <div class="card s12"><div class="hd"><h3>Index distributions</h3></div><p class="say">Distribution by class (violin), individual polygons (points), median (white tick) and median of the surrounding 100 m ring (◇).</p><div id="azVio" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px"></div><div class="keys" id="azVioK"></div></div>
    <div class="card s12"><div class="hd"><h3>Parallel coordinates</h3><span class="sp"></span><span class="note" id="azPcN"></span></div><div class="chips" id="azPcC"></div><p class="say">One line per labelled polygon. Drag along an axis to filter; double-click the axis to reset.</p><svg id="azPc"></svg><div class="keys" id="azPcK"></div></div>
  </div></details>

  <div class="az-sec" id="sec-cs"><h2><em>3</em>How do ponds change over time?</h2><span>Nine summers (2017–2025) at 20 case-study sites, with each pond's history and the rule's suggested change</span></div>
  <div class="az-grid"><div class="card s12 azlink" id="azToCs">Open the Case studies tab <span>pond histories, yearly images and candidate changes →</span></div></div>

  <div class="az-sec" id="sec-pl"><h2><em>4</em>Data explorer</h2><span>Every 2025 BSI candidate polygon with its spectral summary</span></div>
  <details class="az-more"><summary>Open the polygon table · 1,416 polygons, sortable and searchable</summary><div class="az-grid"><div class="card s12"><div class="hd"><input class="az-in" id="azQ" placeholder="Search polygon or farm…" value="${esc(AZ.q)}"><span class="chips" id="azPcls" style="margin:0"></span><span class="sp"></span><span class="note" id="azPlN"></span></div>
    <div class="tblwrap" id="azPl"></div><div class="pager" id="azPg"></div></div></div></details>`;
  $("#azReg").onchange = (e) => { AZ.region = e.target.value; AZ.page = 0; drawAll(); };
  document.querySelectorAll(".az-jump a").forEach((a) => a.onclick = () => $("#sec-" + a.dataset.j).scrollIntoView({ behavior: "smooth", block: "start" }));
  document.querySelectorAll("#azMode button").forEach((b) => b.onclick = () => { AZ.mode = b.dataset.m; document.querySelectorAll("#azMode button").forEach((x) => x.classList.toggle("on", x === b)); drawSig(); });
  const fo = FEATS.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join("");
  $("#azSx").innerHTML = fo; $("#azSy").innerHTML = fo; $("#azSx").value = AZ.sx; $("#azSy").value = AZ.sy;
  $("#azSx").onchange = (e) => { AZ.sx = +e.target.value; drawScatter(); }; $("#azSy").onchange = (e) => { AZ.sy = +e.target.value; drawScatter(); };
  $("#azQ").oninput = (e) => { AZ.q = e.target.value.trim().toLowerCase(); AZ.page = 0; drawPolys(); };
  drawAll();
}
function drawAll() {
  drawKpi(); drawChips(); drawSig(); drawFind(); drawAuc(); drawScatter(); drawViolins(); drawPC();
  drawPrec(); drawSankey(); drawIssues(); drawRidge(); drawTable(); drawCase(); drawPolys();
}
function drawChips() {
  const all = labAll(), n = (k) => all.filter((p) => p.cls === k).length;
  $("#azCls").innerHTML = CLS.filter(([k]) => n(k)).map(([k, name, c]) => `<span class="chip${AZ.hide.has(k) ? " off" : ""}" data-k="${k}"><i style="background:${c};box-shadow:0 0 8px ${c}"></i>${name}<small>${n(k)}</small></span>`).join("") +
    `<span class="note" style="align-self:center">Select a class to toggle it. Polygons from multi-polygon farms carry only a farm-level verdict and are excluded.</span>`;
  document.querySelectorAll("#azCls .chip").forEach((c) => c.onclick = () => { const k = c.dataset.k; AZ.hide.has(k) ? AZ.hide.delete(k) : AZ.hide.add(k); drawChips(); drawSig(); drawFind(); drawAuc(); drawScatter(); drawViolins(); drawPC(); });
}
function drawKpi() {   // four plain-language findings, each with one number
  const ops = ANZ.ops.filter((o) => inRegion(o.region)), all = labAll(), pr = precRows();
  const cor = ops.filter((o) => o.sample === "pond" && o.qc === "correct").length, inc = ops.filter((o) => o.sample === "pond" && o.qc === "incorrect");
  const prec = cor + inc.length ? cor / (cor + inc.length) : null, water = inc.filter((o) => ["wet_runoff", "other_water"].includes(o.feat)).length;
  const best = bestFeature(all), lo = pr[pr.length - 1], hi = pr[0];
  const ms = Object.values(MONTHLY).filter((d) => inRegion(d.region)).map((d) => { const c = seasonCycle(d), pk = d3.max(c), w = d3.mean(winMonths(d).map((m) => c[m - 1]).filter((v) => v != null)); return pk ? w / pk : null; }).filter((v) => v != null);
  const F = [
    ["Accuracy", prec == null ? "–" : Math.round(prec * 100) + "%", prec == null ? "No reviewed detections in this region." : `of reviewed BSI detections are correct${pr.length > 1 ? `, from ${Math.round(lo.p * 100)}% (${esc(lo.name)}) to ${Math.round(hi.p * 100)}% (${esc(hi.name)})` : ""}.`, prec == null ? "#9aa29c" : pcol(prec, cor + inc.length), "qc"],
    ["Main error source", inc.length ? Math.round(100 * water / inc.length) + "%" : "–", inc.length ? "of incorrect detections are wet runoff or natural water rather than manure storage." : "No incorrect detections in this region.", "#5fa8ff", "fp"],
    ["Spectral separability", best ? best.s.toFixed(2) : "–", best ? `best single-feature AUC (${esc(best.name)}; 0.5 = chance). Spectral thresholds alone are unlikely to remove these errors.` : "Insufficient labelled polygons.", "#ec8454", "fp"],
    ["Seasonal coverage", ms.length ? Math.round(100 * d3.median(ms)) + "%" : "–", ms.length ? `of peak monthly pond extent is captured by the annual summer window (median of ${ms.length} sample farms).` : "No monthly sample farms in this region.", "#4cc27a", "cs"]];
  $("#azKpi").innerHTML = F.map(([k, v, s, c, j]) => `<div class="card f4" data-j="${j}"><div class="k">${k}</div><div class="v" style="color:${c}">${v}</div><div class="s">${s}</div></div>`).join("");
  document.querySelectorAll("#azKpi .f4").forEach((el) => el.onclick = () => $("#sec-" + el.dataset.j).scrollIntoView({ behavior: "smooth", block: "start" }));
}
function bestFeature(all) {
  const pond = all.filter((p) => p.cls === "manure_pond"), fp = all.filter((p) => ["wet_runoff", "other_water", "other_fp"].includes(p.cls));
  if (pond.length < 5 || fp.length < 5) return null;
  return FEATS.map((f) => { const a = auc(sorted(pond.map(f.f)), sorted(fp.map(f.f))); return { name: f.name, s: a == null ? 0 : Math.max(a, 1 - a) }; }).sort((x, y) => y.s - x.s)[0];
}

// ---------------------------------------------------------------------------- A1 spectral signature
function drawSig() {
  const W = 980, H = 330, m = { l: 48, r: 16, t: 30, b: 34 }, w = W - m.l - m.r, wl = ANZ.wl, P = lab();
  const x = d3.scaleLinear([470, 890, 1560, 2240], [m.l, m.l + .74 * w, m.l + .8 * w, m.l + w]);
  const val = (p, i) => AZ.mode === "p" ? p.p[i] : AZ.mode === "r" ? p.r[i] : p.p[i] != null && p.r[i] != null ? p.p[i] - p.r[i] : null;
  const groups = CLS.map(([k, name, c]) => { const ps = P.filter((p) => p.cls === k); if (ps.length < 3) return null;
    return { k, name, c, n: ps.length, st: wl.map((_, i) => { const a = sorted(ps.map((p) => val(p, i))); return [q(a, .25), q(a, .5), q(a, .75)]; }) }; }).filter(Boolean);
  const ext = d3.extent(groups.flatMap((g) => g.st.flatMap((s) => [s[0], s[2]])));
  const y = d3.scaleLinear([Math.min(0, ext[0] ?? 0), (ext[1] ?? .3) * 1.08], [H - m.b, m.t]).nice();
  let s = `<defs><linearGradient id="vis" x1="0" x2="1"><stop offset="0" stop-color="#3b6cff" stop-opacity=".16"/><stop offset=".45" stop-color="#3fd17a" stop-opacity=".14"/><stop offset="1" stop-color="#ff4d4d" stop-opacity=".16"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  [["Visible", 450, 690, "url(#vis)"], ["Red edge", 690, 790, "rgba(255,120,120,.07)"], ["NIR", 790, 890, "rgba(255,255,255,.05)"], ["SWIR", 1560, 2240, "rgba(236,132,84,.07)"]].forEach(([n, a, b, f]) => {
    s += `<rect x="${x(Math.max(470, a))}" y="${m.t}" width="${x(b) - x(Math.max(470, a))}" height="${H - m.t - m.b}" fill="${f}"/><text x="${(x(Math.max(470, a)) + x(b)) / 2}" y="${m.t - 10}" text-anchor="middle" font-size="10.5" letter-spacing=".08em" fill="rgba(236,241,238,.5)">${n.toUpperCase()}</text>`; });
  s += `<defs><linearGradient id="bsiCol" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ec8454" stop-opacity=".42"/><stop offset="1" stop-color="#ec8454" stop-opacity=".06"/></linearGradient></defs>`;
  BSI_BANDS.forEach((b) => { const xx = x(wl[ANZ.bands.indexOf(b)]);
    s += `<rect x="${xx - 13}" y="${m.t}" width="26" height="${H - m.t - m.b}" rx="6" fill="url(#bsiCol)" stroke="#ec8454" stroke-opacity=".55" stroke-dasharray="3 3"/>` +
      `<text x="${xx}" y="${m.t + 13}" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:#ffb48f">BSI-E</text>`; });
  const bx = (x(890) + x(1560)) / 2;
  s += `<path d="M${bx - 6} ${H - m.b + 5} l6 -10 M${bx} ${H - m.b + 5} l6 -10" stroke="rgba(255,255,255,.5)"/>`;
  y.ticks(5).forEach((t) => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,${t === 0 ? .35 : .09})"/><text x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end" font-size="10.5">${t.toFixed(2)}</text>`; });
  ANZ.bands.forEach((b, i) => { s += `<text x="${x(wl[i])}" y="${H - m.b + 15}" text-anchor="middle" font-size="${BSI_BANDS.includes(b) ? 11.5 : 10.5}" font-weight="${BSI_BANDS.includes(b) ? 800 : 600}"${BSI_BANDS.includes(b) ? ' style="fill:#ffb48f"' : ""}>${b}</text><text x="${x(wl[i])}" y="${H - m.b + 27}" text-anchor="middle" font-size="9" fill="rgba(236,241,238,.45)">${wl[i]}</text>`; });
  s += axT(W, H, "Sentinel-2 band (centre wavelength, nm)", AZ.mode === "d" ? "Δ reflectance (polygon − ring)" : "Surface reflectance", 12);
  const area = d3.area().x((d, i) => x(wl[i])).y0((d) => y(d[0])).y1((d) => y(d[2])).curve(d3.curveMonotoneX).defined((d) => d[0] != null);
  const line = d3.line().x((d, i) => x(wl[i])).y((d) => y(d[1])).curve(d3.curveMonotoneX).defined((d) => d[1] != null);
  groups.forEach((g) => { s += `<path d="${area(g.st)}" fill="${g.c}" opacity=".13"><animate attributeName="opacity" from="0" to=".13" dur="1.2s"/></path>`; });
  groups.forEach((g) => { const d = line(g.st); s += `<path d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="${g.c}" stroke-width="${g.k === "manure_pond" ? 3 : 2.2}" filter="url(#glow)">${LN_ANIM}</path>` +
    g.st.map((v, i) => v[1] == null ? "" : `<circle cx="${x(wl[i])}" cy="${y(v[1])}" r="3" fill="#15181b" stroke="${g.c}" stroke-width="1.6" opacity="0">${dotAnim((LN_T * x(wl[i]) / W).toFixed(2))}</circle>`).join("") + ballSvg(d, g.c); });
  s += `<line id="sigX" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.55)" stroke-dasharray="3 3" opacity="0"/><rect x="${m.l}" y="${m.t}" width="${w}" height="${H - m.t - m.b}" fill="transparent" id="sigHit"/>`;
  const svg = $("#azSig"); svg.setAttribute("viewBox", `-16 0 ${W + 16} ${H + 16}`); svg.innerHTML = s;
  $("#azSigK").innerHTML = clsKeys(P, `<span><i style="background:rgba(236,132,84,.35);border:1px dashed #ec8454"></i>BSI-E input band</span><span><i style="background:rgba(255,255,255,.18)"></i>interquartile range</span>`);
  svg.querySelector("#sigHit").onmousemove = (e) => { const pt = d3.pointer(e, svg), xv = pt[0] * W / svg.getBoundingClientRect().width;
    const i = d3.leastIndex(wl, (v) => Math.abs(x(v) - xv)), xl = svg.querySelector("#sigX"); xl.setAttribute("x1", x(wl[i])); xl.setAttribute("x2", x(wl[i])); xl.setAttribute("opacity", 1);
    showTip(`<b>${ANZ.bands[i]} · ${BNAME[ANZ.bands[i]]}</b> <span class="mono">${wl[i]} nm</span><br>` + groups.map((g) => `<span style="color:${g.c}">●</span> ${g.name}: <span class="mono">${fmt(g.st[i][1], 3)}</span> <span class="mono" style="opacity:.6">(${fmt(g.st[i][0], 3)}–${fmt(g.st[i][2], 3)})</span>`).join("<br>"), e); };
  svg.querySelector("#sigHit").onmouseleave = () => { hideTip(); svg.querySelector("#sigX").setAttribute("opacity", 0); };
  const pond = groups.find((g) => g.k === "manure_pond"), wet = groups.find((g) => g.k === "wet_runoff"), i11 = ANZ.bands.indexOf("B11");
  $("#azSigSay").innerHTML = pond && wet ? (AZ.mode === "d" ? `Relative to the surrounding ring, SWIR 1 reflectance is <b>${fmt(-pond.st[i11][1], 3)}</b> lower for confirmed ponds and <b>${fmt(-wet.st[i11][1], 3)}</b> lower for wet runoff.`
    : `Median SWIR 1 reflectance: confirmed ponds <b>${fmt(pond.st[i11][1], 3)}</b>, wet runoff <b>${fmt(wet.st[i11][1], 3)}</b>${AZ.mode === "r" ? " (100 m surrounding ring)" : ""}.`)
    : "Insufficient labelled polygons in this region for comparison.";
}

// ---------------------------------------------------------------------------- A2 findings + separability
function sepTable(P) {
  const pond = P.filter((p) => p.cls === "manure_pond");
  const fps = CLS.filter(([k]) => k !== "manure_pond").map(([k, n, c]) => ({ k, n, c, ps: P.filter((p) => p.cls === k) })).filter((g) => g.ps.length >= 5);
  return { pond, fps, rows: FEATS.map((f) => { const a = sorted(pond.map(f.f));
    const cells = fps.map((g) => { const u = auc(a, sorted(g.ps.map(f.f))); return u == null ? null : { s: Math.max(u, 1 - u), up: u > .5 }; });
    return { f, cells, mean: d3.mean(cells, (c) => c && c.s) || 0 }; }).sort((x, y) => y.mean - x.mean) };
}
function drawFind() {
  const P = lab(), T = sepTable(P), el = $("#azFind");
  if (T.pond.length < 5 || !T.fps.length) { el.innerHTML = `<p class="say">Insufficient labelled polygons in this region. Select a broader region.</p>`; return; }
  const med = (ps, f) => q(sorted(ps.map(f.f)), .5), bsi = FEATS[10], dbsi = FEATS[15];
  const L = T.fps.map((g, j) => { const best = [...T.rows].sort((a, b) => (b.cells[j]?.s || 0) - (a.cells[j]?.s || 0))[0], c = best.cells[j];
    const close = [...T.rows].sort((a, b) => (a.cells[j]?.s || 1) - (b.cells[j]?.s || 1))[0];
    return `<div class="find"><i style="background:${g.c};color:${g.c}"></i><div><b>${g.n}</b> (n = ${g.ps.length}): most separable on <b>${esc(best.f.name)}</b> (AUC ${c.s.toFixed(2)}, ${c.up ? "higher" : "lower"} than confirmed ponds); least separable on <b>${esc(close.f.name)}</b> (AUC ${close.cells[j].s.toFixed(2)}). Median BSI-E <span class="mono">${fmt(med(g.ps, bsi), 2)}</span> against <span class="mono">${fmt(med(T.pond, bsi), 2)}</span> for confirmed ponds.</div></div>`; });
  const ring = `<div class="find"><i style="background:#fff;color:#fff"></i><div>Contrast with the 100 m ring (BSI-E decrease, polygon relative to ring): confirmed ponds <b>${fmt(-med(T.pond, dbsi), 2)}</b>; ${T.fps.map((g) => `${g.n.toLowerCase()} <b>${fmt(-med(g.ps, dbsi), 2)}</b>`).join("; ")}.</div></div>`;
  el.innerHTML = L.join("") + ring + `<p class="note">Labels are reviewer verdicts attributable to single polygons (n = ${T.pond.length} confirmed ponds). All polygons satisfy BSI-E &lt; 0.30 by construction, so BSI-E alone cannot exclude them.</p>`;
}
function drawAuc() {
  const T = sepTable(lab()), svg = $("#azAuc");
  if (T.pond.length < 5 || !T.fps.length) { svg.setAttribute("viewBox", "0 0 500 40"); svg.innerHTML = `<text x="0" y="20" font-size="12">Too few labelled polygons.</text>`; return; }
  const rows = T.rows.slice(0, 16), cw = 74, rh = 21, x0 = 150, W = x0 + cw * (T.fps.length + 1) + 6, H = 34 + rows.length * rh;
  const col = d3.scaleSequential([.5, 1], d3.interpolateRgbBasis(["#1d2127", "#2f4a63", "#3987e5", "#ec8454", "#ffe6b8"]));
  let s = T.fps.map((g, j) => `<text x="${x0 + cw * j + cw / 2}" y="14" text-anchor="middle" font-size="10.5" font-weight="700" fill="${g.c}">${esc(g.n.replace("Other false positive", "Other FP"))}</text><text x="${x0 + cw * j + cw / 2}" y="26" text-anchor="middle" font-size="9" fill="rgba(236,241,238,.5)">n=${g.ps.length}</text>`).join("") +
    `<text x="${x0 + cw * T.fps.length + cw / 2}" y="14" text-anchor="middle" font-size="10.5" font-weight="700">Mean</text>`;
  const H2 = H + 44;
  s += cbar(x0, H + 18, cw * (T.fps.length + 1) - 4, col, .5, 1, [[.5], [.6], [.7], [.8], [.9], [1]], "AUC colour scale · 0.5 = chance, 1.0 = complete separation", (v) => v.toFixed(1));
  rows.forEach((r, i) => { const yy = 32 + i * rh;
    const isB = BSI_BANDS.includes(r.f.k) || r.f.k === "bsi_e" || r.f.k === "d_bsi_e";
    s += `<text x="${x0 - 8}" y="${yy + 14}" text-anchor="end" font-size="11"${isB ? ' font-weight="700" style="fill:#ffb48f"' : ""}>${isB ? "● " : ""}${esc(r.f.name)}</text>`;
    r.cells.concat([{ s: r.mean, mean: true }]).forEach((c, j) => { if (!c) return; const fill = col(c.s), dark = c.s > .8;
      s += `<g><rect x="${x0 + cw * j + 2}" y="${yy + 1}" width="${cw - 4}" height="${rh - 3}" rx="5" fill="${fill}" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${(i * .04).toFixed(2)}s" dur=".4s" fill="freeze"/><title>${esc(r.f.name)}: AUC ${c.s.toFixed(3)}</title></rect>
        <text x="${x0 + cw * j + cw / 2}" y="${yy + 14}" text-anchor="middle" font-size="10.5" font-family="IBM Plex Mono" style="fill:${dark ? "#15181b" : "#fff"}">${c.s.toFixed(2)}${c.mean ? "" : c.up ? " ▲" : " ▼"}</text></g>`; }); });
  svg.setAttribute("viewBox", `0 0 ${W} ${H2}`); svg.innerHTML = s;
}

// ---------------------------------------------------------------------------- A3 scatter with density contours
function drawScatter() {
  const W = 700, H = 400, m = { l: 50, r: 14, t: 12, b: 38 }, fx = FEATS[AZ.sx], fy = FEATS[AZ.sy], P = lab().filter((p) => fx.f(p) != null && fy.f(p) != null), svg = $("#azSc");
  const ax = sorted(P.map(fx.f)), ay = sorted(P.map(fy.f));
  if (P.length < 5) { svg.setAttribute("viewBox", `0 0 ${W} 40`); svg.innerHTML = `<text x="0" y="20" font-size="12">Too few labelled polygons.</text>`; return; }
  const pad = (a) => { const lo = q(a, .01), hi = q(a, .99), d = (hi - lo) * .08 || 1; return [lo - d, hi + d]; };
  const x = d3.scaleLinear(pad(ax), [m.l, W - m.r]), y = d3.scaleLinear(pad(ay), [H - m.b, m.t]);
  let s = `<defs><clipPath id="scClip"><rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></clipPath></defs>`;
  x.ticks(6).forEach((t) => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.07)"/><text x="${x(t)}" y="${H - m.b + 14}" text-anchor="middle" font-size="10">${+t.toFixed(2)}</text>`; });
  y.ticks(6).forEach((t) => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.07)"/><text x="${m.l - 6}" y="${y(t) + 3}" text-anchor="end" font-size="10">${+t.toFixed(2)}</text>`; });
  if (fx.k === "bsi_e") s += `<line x1="${x(.3)}" x2="${x(.3)}" y1="${m.t}" y2="${H - m.b}" stroke="#fff" stroke-dasharray="4 4" opacity=".6"/><text x="${x(.3) + 4}" y="${m.t + 10}" font-size="9.5" fill="#fff">pond rule 0.30</text>`;
  if (fy.k === "bsi_e") s += `<line y1="${y(.3)}" y2="${y(.3)}" x1="${m.l}" x2="${W - m.r}" stroke="#fff" stroke-dasharray="4 4" opacity=".6"/>`;
  s += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end" font-size="11" font-weight="700">${esc(fx.name)} →</text><text x="${m.l + 6}" y="${m.t + 12}" font-size="11" font-weight="700">↑ ${esc(fy.name)}</text>`;
  s += `<g clip-path="url(#scClip)">`;
  CLS.forEach(([k, , c]) => { const ps = P.filter((p) => p.cls === k); if (ps.length < 6) return;
    const cs = d3.contourDensity().x((p) => x(fx.f(p))).y((p) => y(fy.f(p))).size([W, H]).bandwidth(22).thresholds(5)(ps);
    cs.forEach((g, i) => { s += `<path d="${d3.geoPath()(g)}" fill="${c}" fill-opacity="${.035 + i * .025}" stroke="${c}" stroke-opacity="${.25 + i * .12}" stroke-width="1"/>`; }); });
  P.forEach((p, i) => { s += `<circle cx="${x(fx.f(p))}" cy="${y(fy.f(p))}" r="${p.cls === "manure_pond" ? 3.4 : 3}" fill="${CLSC[p.cls]}" fill-opacity=".85" stroke="#0b0c0d" stroke-width=".8" data-i="${i}" style="cursor:${hasImg(p.op) ? "pointer" : "default"}"/>`; });
  s += `</g>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
  $("#azScK").innerHTML = clsKeys(P, `<span><svg viewBox="0 0 20 8"><ellipse cx="10" cy="4" rx="8" ry="3" fill="none" stroke="#cfd5d1"/></svg>density contour (denser inward)</span>`);
  svg.querySelectorAll("circle[data-i]").forEach((c) => { const p = P[+c.dataset.i];
    c.onmousemove = (e) => showTip(`<b>${esc(pidName(p))}</b><br><span style="color:${CLSC[p.cls]}">●</span> ${CLSN[p.cls]} · ${esc(regionName(p.region))}<br>${esc(fx.name)} <span class="mono">${fmt(fx.f(p), 3)}</span> · ${esc(fy.name)} <span class="mono">${fmt(fy.f(p), 3)}</span><br>${fmt(p.area)} m²${hasImg(p.op) ? "<br><i>click to open the farm</i>" : ""}`, e);
    c.onmouseleave = hideTip; c.onclick = () => { hideTip(); openFarm(p.op); }; });
}

// ---------------------------------------------------------------------------- A4 violins
function drawViolins() {
  const P = lab(), el = $("#azVio"), groups = CLS.filter(([k]) => P.filter((p) => p.cls === k).length >= 3);
  el.innerHTML = ANZ.idx.map((n, j) => {
    const f = FEATS[10 + j], all = sorted(P.map(f.f)); if (!all.length) return "";
    const W = 260, rh = 50, m = { l: 8, r: 10, t: 24, b: 20 }, H = m.t + m.b + groups.length * rh;
    const lo = q(all, .02), hi = q(all, .98), d = (hi - lo) * .06, x = d3.scaleLinear([lo - d, hi + d], [m.l, W - m.r]).nice(), xs = d3.range(61).map((i) => x.domain()[0] + i * (x.domain()[1] - x.domain()[0]) / 60);
    let s = `<text x="${m.l}" y="13" font-size="12" font-weight="700" style="fill:#fff">${INAME[n]}</text>`;
    x.ticks(4).forEach((t) => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.07)"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle" font-size="9.5">${+t.toFixed(2)}</text>`; });
    if (n === "bsi_e") s += `<line x1="${x(.3)}" x2="${x(.3)}" y1="${m.t - 4}" y2="${H - m.b}" stroke="#fff" stroke-dasharray="3 3" opacity=".7"/><text x="${x(.3) + 3}" y="${m.t - 6}" font-size="9" style="fill:#fff">0.30</text>`;
    groups.forEach(([k, name, c], i) => { const ps = P.filter((p) => p.cls === k), v = sorted(ps.map(f.f)), cy = m.t + i * rh + rh / 2; if (v.length < 3) return;
      const bw = (x.domain()[1] - x.domain()[0]) / 14, dens = kde(v, xs, bw), mx = d3.max(dens, (dd) => dd[1]) || 1, hh = rh * .42;
      const ar = d3.area().x((dd) => x(dd[0])).y0((dd) => cy + hh * dd[1] / mx).y1((dd) => cy - hh * dd[1] / mx).curve(d3.curveBasis)(dens);
      s += `<path d="${ar}" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="1.2"/>` + (`<text x="${m.l}" y="${cy - hh - 1}" font-size="8.5" style="fill:${c}" opacity=".9">${name}</text>`);
      ps.forEach((p, t) => { const vv = f.f(p); if (vv == null || vv < x.domain()[0] || vv > x.domain()[1]) return; const jy = cy + ((t * 7919) % 100 / 100 - .5) * hh * 1.1;
        s += `<circle cx="${x(vv)}" cy="${jy}" r="1.5" fill="${c}" opacity=".7"/>`; });
      const md = q(v, .5), rg = q(sorted(ps.map((p) => p.r[10 + j])), .5);
      s += `<line x1="${x(md)}" x2="${x(md)}" y1="${cy - hh}" y2="${cy + hh}" stroke="#fff" stroke-width="2.2"/>`;
      if (rg != null && rg >= x.domain()[0] && rg <= x.domain()[1]) s += `<path d="M${x(rg)} ${cy - 5}l5 5l-5 5l-5 -5z" fill="none" stroke="${c}" stroke-width="1.5"/>`;
      s += `<title>${name}: median ${fmt(md, 3)}, ring ${fmt(rg, 3)}</title>`; });
    return `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`; }).join("");
  $("#azVioK").innerHTML = clsKeys(P, `<span><i style="background:#fff;width:3px;height:12px;border-radius:1px"></i>median</span><span><svg viewBox="0 0 20 8"><path d="M10 0l4 4l-4 4l-4 -4z" fill="none" stroke="#cfd5d1"/></svg>100 m ring median</span>`);
}

// ---------------------------------------------------------------------------- A5 parallel coordinates
function drawPC() {
  const axes = [10, 11, 12, 13, 14, 15, 16, 20].map((i) => FEATS[i]), P = lab().filter((p) => axes.every((f) => f.f(p) != null)), svg = $("#azPc");
  const W = 1200, H = 330, m = { l: 30, r: 30, t: 30, b: 22 }, xs = d3.scalePoint(axes.map((a) => a.k), [m.l, W - m.r]);
  const ys = Object.fromEntries(axes.map((a) => { const v = sorted(P.map(a.f)); return [a.k, d3.scaleLinear([q(v, .01) ?? 0, q(v, .99) ?? 1], [H - m.b, m.t]).clamp(true)]; }));
  const path = (p) => d3.line().curve(d3.curveMonotoneX)(axes.map((a) => [xs(a.k), ys[a.k](a.f(p))]));
  const order = [...P].sort((a, b) => (a.cls === "manure_pond") - (b.cls === "manure_pond"));
  d3.select(svg).attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
  const g = d3.select(svg);
  const lines = g.append("g").selectAll("path").data(order).join("path").attr("d", path).attr("fill", "none").attr("stroke", (p) => CLSC[p.cls]).attr("stroke-width", 1).attr("stroke-opacity", .22)
    .on("mousemove", (e, p) => showTip(`<b>${esc(pidName(p))}</b><br>${CLSN[p.cls]} · ${esc(regionName(p.region))}`, e)).on("mouseleave", hideTip)
    .on("click", (e, p) => openFarm(p.op));
  const picked = (p) => !AZ.pcSel.size || AZ.pcSel.has(p.cls);
  lines.attr("stroke", (p) => picked(p) ? CLSC[p.cls] : "#6b7178").sort((a, b) => picked(a) - picked(b));
  const update = () => { let n = 0; lines.attr("stroke-opacity", (p) => { if (!picked(p)) return .06; const ok = axes.every((a) => { const b = AZ.brush[a.k]; if (!b) return true; const v = ys[a.k](a.f(p)); return v >= b[0] && v <= b[1]; }); if (ok) n++; return ok ? (Object.values(AZ.brush).some(Boolean) || AZ.pcSel.size ? .6 : .22) : .025; });
    $("#azPcN").textContent = `${n} of ${P.length} polygons selected`; };
  axes.forEach((a) => { const ax = g.append("g").attr("transform", `translate(${xs(a.k)},0)`);
    ax.call(d3.axisLeft(ys[a.k]).ticks(5).tickSize(3)).call((s) => { s.selectAll("text").attr("font-size", 9.5).style("paint-order", "stroke").style("stroke", "#121417").style("stroke-width", "3px"); s.select(".domain").attr("stroke", "rgba(255,255,255,.4)"); s.selectAll(".tick line").attr("stroke", "rgba(255,255,255,.4)"); });
    ax.append("text").attr("y", m.t - 12).attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700).style("fill", "#fff").text(a.name.replace(" vs ring", " ring"));
    const br = d3.brushY().extent([[-12, m.t], [12, H - m.b]]).on("brush end", (e) => { AZ.brush[a.k] = e.selection; update(); });
    ax.append("g").call(br).on("dblclick", function () { d3.select(this).call(br.move, null); });
    if (AZ.brush[a.k]) ax.select("g:last-child").call(br.move, AZ.brush[a.k]); });
  g.selectAll(".selection").attr("fill", "#ec8454").attr("fill-opacity", .25).attr("stroke", "#ec8454");
  update();
  const cn = d3.rollup(P, (v) => v.length, (p) => p.cls);
  $("#azPcC").innerHTML = `<span class="note" style="align-self:center">Show:</span><span class="chip${AZ.pcSel.size ? " off" : ""}" data-k=""><i style="background:#fff"></i>All classes</span>` +
    CLS.filter(([k]) => cn.get(k)).map(([k, name, c]) => `<span class="chip${AZ.pcSel.has(k) ? "" : " off"}" data-k="${k}"><i style="background:${c};box-shadow:0 0 8px ${c}"></i>${AZ.pcSel.has(k) ? "☑" : "☐"} ${name}<small>${cn.get(k)}</small></span>`).join("") +
    `<span class="note" style="align-self:center">Tick one or more classes; the others stay in grey for context.</span>`;
  document.querySelectorAll("#azPcC .chip").forEach((c) => c.onclick = () => { const k = c.dataset.k; if (!k) AZ.pcSel.clear(); else AZ.pcSel.has(k) ? AZ.pcSel.delete(k) : AZ.pcSel.add(k); drawPC(); });
  $("#azPcK").innerHTML = clsKeys(P, `<span><i style="background:rgba(236,132,84,.4);border:1px solid #ec8454"></i>axis filter</span>`);
}

// ---------------------------------------------------------------------------- B1 precision with intervals
function precRows() {
  return Object.entries(DASH.regions || {}).filter(([r]) => inRegion(r)).map(([r, v]) => { const pr = v.precision || {}, P = PREC[r] || {};
    return { r, name: regionName(r), n: pr.n || 0, k: pr.correct || 0, p: pr.precision, np: P.no_pond && P.no_pond.n >= 5 ? P.no_pond : null }; }).filter((d) => d.n >= 10).sort((a, b) => b.p - a.p);
}
function drawPrec() {
  const rows = precRows(), svg = $("#azPr"), W = 640, rh = 26, m = { l: 110, r: 84, t: 22, b: 24 }, H = m.t + m.b + rows.length * rh;
  if (!rows.length) { svg.setAttribute("viewBox", `0 0 ${W} 40`); svg.innerHTML = `<text x="0" y="20" font-size="12">No region here has 10 or more checked ponds.</text>`; $("#azPrSay").textContent = ""; return; }
  const x = d3.scaleLinear([0, 1], [m.l, W - m.r]), K = d3.sum(rows, (d) => d.k), N = d3.sum(rows, (d) => d.n), r = d3.scaleSqrt([0, d3.max(rows, (d) => d.n)], [3, 9]);
  let s = `<defs><linearGradient id="prg" x1="0" x2="1"><stop offset="0" stop-color="#d64545" stop-opacity=".22"/><stop offset=".55" stop-color="#d99a00" stop-opacity=".12"/><stop offset="1" stop-color="#2e9d5b" stop-opacity=".22"/></linearGradient></defs>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="url(#prg)" rx="6"/>`;
  [0, .25, .5, .75, 1].forEach((t) => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.1)"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle" font-size="10">${t * 100}%</text>`; });
  s += `<line x1="${x(K / N)}" x2="${x(K / N)}" y1="${m.t - 6}" y2="${H - m.b}" stroke="#fff" stroke-dasharray="4 3"/><text x="${x(K / N)}" y="${m.t - 9}" text-anchor="middle" font-size="10" style="fill:#fff">pooled ${Math.round(100 * K / N)}%</text>`;
  rows.forEach((d, i) => { const yy = m.t + i * rh + rh / 2, [lo, hi] = wilson(d.k, d.n), c = pcol(d.p, d.n), go = d.r.startsWith("USA/") ? `s:${d.r.split("/")[1]}` : `c:${d.r}`;
    s += `<g data-go="${go}" style="cursor:pointer"><text x="${m.l - 8}" y="${yy + 4}" text-anchor="end" font-size="11.5" font-weight="600">${esc(d.name)}</text>
      <line x1="${x(lo)}" x2="${x(hi)}" y1="${yy}" y2="${yy}" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
      <line x1="${x(lo)}" x2="${x(lo)}" y1="${yy - 5}" y2="${yy + 5}" stroke="${c}" stroke-width="1.5"/><line x1="${x(hi)}" x2="${x(hi)}" y1="${yy - 5}" y2="${yy + 5}" stroke="${c}" stroke-width="1.5"/>
      ${d.np ? `<path d="M${x(d.np.precision)} ${yy - 6}l6 6l-6 6l-6 -6z" fill="none" stroke="#fff" stroke-width="1.4" opacity=".85"><title>No-pond agreement ${Math.round(d.np.precision * 100)}% (${d.np.correct}/${d.np.n})</title></path>` : ""}
      <circle cx="${x(d.p)}" cy="${yy}" r="${r(d.n)}" fill="${c}" stroke="#fff" stroke-width="1.2" style="filter:drop-shadow(0 0 6px ${c})"><title>${d.name}: ${d.k}/${d.n} = ${Math.round(d.p * 100)}% (95% ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)</title></circle>
      <text x="${W - m.r + 16}" y="${yy + 4}" font-size="11" font-family="IBM Plex Mono">${Math.round(d.p * 100)}% <tspan style="fill:rgba(236,241,238,.5)">${d.k}/${d.n}</tspan></text></g>`; });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
  svg.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => { const [k, v] = el.dataset.go.split(":"); setTab("map"); k === "c" ? goCountry(v) : goState(v); });
  const wide = rows.filter((d) => { const [lo, hi] = wilson(d.k, d.n); return hi - lo > .3; });
  $("#azPrSay").innerHTML = `Pooled precision is <b>${Math.round(100 * K / N)}%</b> across ${N} reviewed detections. ${wide.length ? `<b>${wide.length}</b> region${wide.length > 1 ? "s have intervals" : " has an interval"} wider than 30 percentage points and cannot be ranked reliably.` : "All intervals are narrow enough for ranking."}`;
}

// ---------------------------------------------------------------------------- B2 sankey
function drawSankey() {
  const svg = $("#azSk"), W = 640, H = 330, ops = ANZ.ops.filter((o) => inRegion(o.region));
  if (!d3.sankey || !ops.length) { svg.setAttribute("viewBox", `0 0 ${W} 40`); svg.innerHTML = `<text x="0" y="20" font-size="12">${d3.sankey ? "No farms." : "Sankey library did not load."}</text>`; return; }
  const said = (o) => o.sample === "pond" ? "Pond detected" : "No pond detected", ver = (o) => o.qc ? titleCase(o.qc) : "Not reviewed";
  const saw = (o) => { if (!o.qc) return null; const f = o.feat === "no_visible_candidate" ? "No visible feature" : o.feat === "other_water" ? "Natural water" : o.feat ? human(o.feat) : "Not recorded"; return f[0].toUpperCase() + f.slice(1); };
  const links = {}, add = (a, b) => { const k = a + "→" + b; links[k] = (links[k] || 0) + 1; };
  ops.forEach((o) => { add("a:" + said(o), "b:" + ver(o)); const w = saw(o); if (w) add("b:" + ver(o), "c:" + w); });
  const names = [...new Set(Object.keys(links).flatMap((k) => k.split("→")))];
  const ncol = (n) => { const t = n.slice(2); return { Correct: QCC.correct, Incorrect: QCC.incorrect, Uncertain: QCC.uncertain, "Not reviewed": "#6b7178", "Pond detected": "#ec8454", "No pond detected": "#8a95a3",
    "Manure pond": "#4cc27a", "Wet runoff": "#5fa8ff", "Natural water": "#b3a6ff", "Possible manure": "#e0a526", Vegetation: "#7dbb5a", "No visible feature": "#9aa29c", Unclear: "#7d858c" }[t] || "#9085e9"; };
  const graph = d3.sankey().nodeAlign(d3.sankeyLeft).nodeId((d) => d.name).nodeWidth(12).nodePadding(10).extent([[4, 18], [W - 4, H - 6]])({
    nodes: names.map((name) => ({ name })), links: Object.entries(links).map(([k, value]) => { const [source, target] = k.split("→"); return { source, target, value }; }) });
  let s = `<defs>${graph.links.map((l, i) => `<linearGradient id="skg${i}" gradientUnits="userSpaceOnUse" x1="${l.source.x1}" x2="${l.target.x0}"><stop offset="0" stop-color="${ncol(l.source.name)}"/><stop offset="1" stop-color="${ncol(l.target.name)}"/></linearGradient>`).join("")}</defs>`;
  [["BSI output", 4, "start"], ["Reviewer verdict", W / 2, "middle"], ["Observed surface", W - 4, "end"]].forEach(([t, xx, a]) => { s += `<text x="${xx}" y="10" text-anchor="${a}" font-size="10" letter-spacing=".07em" fill="rgba(236,241,238,.5)">${t.toUpperCase()}</text>`; });
  graph.links.forEach((l, i) => { s += `<path d="${d3.sankeyLinkHorizontal()(l)}" fill="none" stroke="url(#skg${i})" stroke-opacity=".38" stroke-width="${Math.max(1, l.width)}"><title>${l.source.name.slice(2)} → ${l.target.name.slice(2)}: ${l.value}</title></path>`; });
  graph.nodes.forEach((n) => { const left = n.x0 < W / 2 - 20, mid = Math.abs(n.x0 - W / 2) < 60, c = ncol(n.name);
    s += `<rect x="${n.x0}" y="${n.y0}" width="${n.x1 - n.x0}" height="${Math.max(1, n.y1 - n.y0)}" rx="3" fill="${c}" style="filter:drop-shadow(0 0 5px ${c})"/>
      <text x="${mid ? n.x1 + 6 : left ? n.x1 + 6 : n.x0 - 6}" y="${(n.y0 + n.y1) / 2 + 4}" text-anchor="${mid || left ? "start" : "end"}" font-size="11" font-weight="600" style="fill:#fff">${esc(n.name.slice(2))} <tspan font-family="IBM Plex Mono" font-weight="400" style="fill:rgba(236,241,238,.6)">${n.value}</tspan></text>`; });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
}

// ---------------------------------------------------------------------------- B3 issues heatmap
function drawIssues() {
  const svg = $("#azIs"), ops = ANZ.ops.filter((o) => inRegion(o.region) && o.qc), issues = [...new Set(ops.map((o) => o.issue).filter((i) => i && i !== "none"))];
  const cnt = d3.rollup(ops.filter((o) => o.issue && o.issue !== "none"), (v) => v.length, (o) => o.issue);
  issues.sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0));
  const regs = [...new Set(ops.map((o) => o.region))].sort((a, b) => regionName(a).localeCompare(regionName(b)));
  if (!issues.length) { svg.setAttribute("viewBox", "0 0 500 40"); svg.innerHTML = `<text x="0" y="20" font-size="12">No issues flagged here.</text>`; return; }
  const cw = 86, rh = 22, x0 = 104, W = x0 + cw * issues.length + 4, H = 40 + regs.length * rh, col = d3.scaleSequential([0, .5], d3.interpolateRgbBasis(["#1d2127", "#5b3a7a", "#d0562a", "#ffd08a"])).clamp(true);
  let s = issues.map((iss, j) => `<text x="${x0 + cw * j + cw / 2}" y="14" text-anchor="middle" font-size="10.5" font-weight="700">${esc(titleCase(iss).replace("Missed Small Feature", "Missed small").replace("Footprint Clipping", "Footprint clip").replace("Merged Detection", "Merged").replace("Split Detection", "Split"))}</text><text x="${x0 + cw * j + cw / 2}" y="27" text-anchor="middle" font-size="9" fill="rgba(236,241,238,.5)">${cnt.get(iss)} total</text>`).join("");
  s += cbar(x0, H + 18, Math.min(cw * issues.length - 4, 340), col, 0, .5, [[0], [.1], [.2], [.3], [.4], [.5, "+"]], "Share of reviewed farms", (v) => Math.round(v * 100) + "%");
  regs.forEach((r, i) => { const rs = ops.filter((o) => o.region === r), yy = 34 + i * rh;
    s += `<text x="${x0 - 8}" y="${yy + 14}" text-anchor="end" font-size="11">${esc(regionName(r))}</text>`;
    issues.forEach((iss, j) => { const n = rs.filter((o) => o.issue === iss).length, sh = n / rs.length;
      s += `<rect x="${x0 + cw * j + 2}" y="${yy + 1}" width="${cw - 4}" height="${rh - 3}" rx="5" fill="${n ? col(sh) : "rgba(255,255,255,.03)"}"><title>${regionName(r)} · ${human(iss)}: ${n} of ${rs.length} reviewed (${Math.round(sh * 100)}%)</title></rect>` +
        (n ? `<text x="${x0 + cw * j + cw / 2}" y="${yy + 14}" text-anchor="middle" font-size="10.5" font-family="IBM Plex Mono" style="fill:${sh > .3 ? "#15181b" : "#fff"}">${n}</text>` : ""); }); });
  svg.setAttribute("viewBox", `0 0 ${W} ${H + 44}`); svg.innerHTML = s;
}

// ---------------------------------------------------------------------------- B4 ridgeline of pond size
function drawRidge() {
  const svg = $("#azRg"), P = ANZ.polys.filter((p) => p.qc === "correct" && p.area > 0 && inRegion(p.region));
  const key = (p) => AZ.region && AZ.region.startsWith("USA") ? p.region : p.region.split("/")[0];
  const groups = [...d3.group(P, key)].filter(([, v]) => v.length >= 5).map(([k, v]) => ({ k, v: sorted(v.map((p) => Math.log10(p.area))) })).sort((a, b) => q(b.v, .5) - q(a.v, .5));
  if (!groups.length) { svg.setAttribute("viewBox", "0 0 700 40"); svg.innerHTML = `<text x="0" y="20" font-size="12">Too few polygons at correct farms.</text>`; $("#azRgSay").textContent = ""; return; }
  const W = 760, rh = 30, m = { l: 110, r: 70, t: 14, b: 26 }, H = m.t + m.b + groups.length * rh + 26, x = d3.scaleLinear([1.8, 6], [m.l, W - m.r]), xs = d3.range(1.8, 6.01, .05);
  let s = "";
  [2, 3, 4, 5, 6].forEach((t) => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.08)"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle" font-size="10">${kfmt(10 ** t)} m²</text>`; });
  s += `<line x1="${x(Math.log10(500))}" x2="${x(Math.log10(500))}" y1="${m.t}" y2="${H - m.b}" stroke="#fff" stroke-dasharray="3 3" opacity=".45"/><text x="${x(Math.log10(500)) + 4}" y="${H - m.b - 4}" font-size="9" style="fill:#fff" opacity=".7">5 px rule (500 m²)</text>`;
  groups.forEach((g, i) => { const base = m.t + 26 + (i + 1) * rh, dens = kde(g.v, xs, .18), mx = d3.max(dens, (d) => d[1]), c = COUNTRIES[g.k] ? COUNTRIES[g.k].col : d3.schemeTableau10[i % 10];
    const ar = d3.area().x((d) => x(d[0])).y0(base).y1((d) => base - (rh * 1.7) * d[1] / mx).curve(d3.curveBasis)(dens);
    s += `<path d="${ar}" fill="${c}" fill-opacity=".32" stroke="${c}" stroke-width="1.5" style="filter:drop-shadow(0 -2px 6px ${c}55)"/><line x1="${x(q(g.v, .5))}" x2="${x(q(g.v, .5))}" y1="${base}" y2="${base - rh * .9}" stroke="#fff" stroke-width="1.6"/>
      <text x="${m.l - 8}" y="${base - 3}" text-anchor="end" font-size="11.5" font-weight="600">${esc(regionName(g.k))}</text><text x="${W - m.r + 6}" y="${base - 3}" font-size="10.5" font-family="IBM Plex Mono">${kfmt(10 ** q(g.v, .5))} <tspan style="fill:rgba(236,241,238,.5)">n${g.v.length}</tspan></text>`; });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
  const big = groups[0], small = groups[groups.length - 1];
  $("#azRgSay").innerHTML = `Median pond area ranges from <b>${kfmt(10 ** q(small.v, .5))} m²</b> (${esc(regionName(small.k))}) to <b>${kfmt(10 ** q(big.v, .5))} m²</b> (${esc(regionName(big.k))}), a ${Math.round(10 ** (q(big.v, .5) - q(small.v, .5)))}-fold difference. White tick: median.`;
}

// ---------------------------------------------------------------------------- B5 region table
function drawTable() {
  const regs = [...new Set(ANZ.ops.filter((o) => inRegion(o.region)).map((o) => o.region))];
  const rows = regs.map((r) => { const os = ANZ.ops.filter((o) => o.region === r), pr = (DASH.regions[r] || {}).precision || {}, P = PREC[r] || {}, ps = ANZ.polys.filter((p) => p.region === r && p.qc === "correct");
    const wrong = os.filter((o) => o.qc === "incorrect"), water = wrong.filter((o) => ["wet_runoff", "other_water"].includes(o.feat)).length, iss = d3.rollups(os.filter((o) => o.issue && o.issue !== "none" && o.issue !== "other"), (v) => v.length, (o) => o.issue).sort((a, b) => b[1] - a[1])[0];
    return { r, name: regionName(r), n: os.length, img: PTS.filter((p) => p.region === r && p.img).length, prec: pr.n ? pr.precision : null, pn: pr.n || 0, np: P.no_pond && P.no_pond.n ? P.no_pond.precision : null,
      water: wrong.length ? water / wrong.length : null, area: ps.length ? d3.median(ps, (p) => p.area) : null, iss: iss ? `${human(iss[0])} (${iss[1]})` : "–" }; });
  const cols = [["name", "Region"], ["n", "QC farms", 1], ["img", "With images", 1], ["prec", "Precision", 1], ["np", "No-pond agree", 1], ["water", "Wrong = water", 1], ["area", "Median pond m²", 1], ["iss", "Top issue"]];
  const [sk, sd] = AZ.tsort || ["prec", -1]; rows.sort((a, b) => ((a[sk] ?? -1) > (b[sk] ?? -1) ? 1 : (a[sk] ?? -1) < (b[sk] ?? -1) ? -1 : 0) * sd);
  const bar = (v, c) => v == null ? "–" : `<span class="bar" style="width:${Math.round(v * 60)}px;background:${c}"></span>${Math.round(v * 100)}%`;
  $("#azTbl").innerHTML = `<table class="az-tbl"><thead><tr>${cols.map(([k, n, num]) => `<th data-k="${k}" class="${num ? "num" : ""}">${n}${k === sk ? (sd > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody>${rows.map((d) => {
    const go = d.r.startsWith("USA/") ? `s:${d.r.split("/")[1]}` : `c:${d.r}`;
    return `<tr class="go" data-go="${go}"><td><b style="color:#fff">${esc(d.name)}</b></td><td class="num mono">${d.n}</td><td class="num mono">${d.img}</td><td class="num mono">${bar(d.prec, pcol(d.prec, d.pn))}</td><td class="num mono">${bar(d.np, "#8a95a3")}</td><td class="num mono">${bar(d.water, "#5fa8ff")}</td><td class="num mono">${d.area == null ? "–" : fmt(d.area)}</td><td>${esc(d.iss)}</td></tr>`; }).join("")}</tbody></table>`;
  document.querySelectorAll("#azTbl th").forEach((th) => th.onclick = () => { const k = th.dataset.k; AZ.tsort = [k, sk === k ? -sd : -1]; drawTable(); });
  document.querySelectorAll("#azTbl tr.go").forEach((tr) => tr.onclick = () => { const [k, v] = tr.dataset.go.split(":"); setTab("map"); k === "c" ? goCountry(v) : goState(v); });
}

// ---------------------------------------------------------------------------- C case study grid
function drawCase() {
  if (!$("#azCase")) { const l = $("#azToCs"); if (l) l.onclick = () => setTab("cst"); return; }
  const Y = DASH.years, list = ANZ.case.map((op) => DASH.farms.find((f) => f.op === op)).filter((f) => f && inRegion(f.region));
  $("#azCase").innerHTML = list.length ? list.map((f, i) => {
    const W = 200, H = 54, x = d3.scaleLinear([Y[0], Y[Y.length - 1]], [2, W - 2]), mx = d3.max(f.area) || 1, y = d3.scaleLinear([0, mx], [H - 4, 6]);
    const pts = f.area.map((v, j) => [x(Y[j]), v == null ? null : y(v)]), ln = d3.line().defined((d) => d[1] != null).curve(d3.curveMonotoneX)(pts), ar = d3.area().defined((d) => d[1] != null).y0(H - 4).y1((d) => d[1]).curve(d3.curveMonotoneX)(pts);
    const c = COUNTRIES[f.region.split("/")[0]]?.col || "#ec8454", ev = Object.entries(f.events || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${STATUS[k] ? STATUS[k][0] : human(k)}`).join(" · ");
    return `<div class="cs" data-op="${esc(f.op)}"><div class="t">${esc(opShort(f.op))}<span>${esc(human(f.region))}</span></div>
      <svg viewBox="-24 0 ${W + 36} ${H + 11}"><defs><linearGradient id="csg${i}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
      ${f.thin.map((t) => `<rect x="${x(t) - 6}" y="2" width="12" height="${H - 4}" fill="rgba(217,154,0,.16)"/>`).join("")}<path d="${ar}" fill="url(#csg${i})"/><path d="${ln}" fill="none" stroke="${c}" stroke-width="2"/>
      ${pts.map((p) => p[1] == null ? "" : `<circle cx="${p[0]}" cy="${p[1]}" r="1.8" fill="#fff"/>`).join("")}<line x1="2" x2="2" y1="6" y2="${H - 4}" stroke="rgba(255,255,255,.25)"/><line x1="2" x2="${W - 2}" y1="${H - 4}" y2="${H - 4}" stroke="rgba(255,255,255,.25)"/><text x="-1" y="${y(mx) + 3}" text-anchor="end" font-size="8">${kfmt(mx)}</text><text x="-1" y="${H - 2}" text-anchor="end" font-size="8">0</text>${[Y[0], 2021, Y[Y.length - 1]].map((t) => `<text x="${x(t)}" y="${H + 9}" text-anchor="middle" font-size="8">${t}</text>`).join("")}</svg>
      <div class="m">peak ${kfmt(mx)} m² · ${f.prod_ponds ?? 0} pond(s) 2025${ev ? " · " + esc(ev) : ""}</div></div>`; }).join("")
    : `<p class="say">No case-study sites in this region.</p>`;
  document.querySelectorAll("#azCase .cs").forEach((el) => el.onclick = () => openFarm(el.dataset.op));
}

// ---------------------------------------------------------------------------- D polygon table
function drawPolys() {
  const all = ANZ.polys.filter((p) => inRegion(p.region)), cnt = d3.rollup(all, (v) => v.length, (p) => p.cls);
  $("#azPcls").innerHTML = [["", "All", "#fff"], ...CLS, ["unlabelled", "Unlabelled", "#6b7178"]].filter(([k]) => !k || cnt.get(k)).map(([k, n, c]) =>
    `<span class="chip${AZ.cls === k ? "" : " off"}" data-k="${k}"><i style="background:${c}"></i>${n}<small>${k ? cnt.get(k) : all.length}</small></span>`).join("");
  document.querySelectorAll("#azPcls .chip").forEach((c) => c.onclick = () => { AZ.cls = c.dataset.k; AZ.page = 0; drawPolys(); });
  let P = all.filter((p) => (!AZ.cls || p.cls === AZ.cls) && (!AZ.q || p.pid.toLowerCase().includes(AZ.q)));
  const val = { area: (p) => p.area, bsi: (p) => p.p[10], ndvi: (p) => p.p[11], mndwi: (p) => p.p[13], d: (p) => p.p[10] != null && p.r[10] != null ? p.p[10] - p.r[10] : null, region: (p) => p.region, cls: (p) => p.cls, pid: (p) => p.pid };
  const [sk, sd] = AZ.sort; P = P.sort((a, b) => { const x = val[sk](a), y = val[sk](b); return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sd; });
  const per = 25, pages = Math.max(1, Math.ceil(P.length / per)); AZ.page = Math.min(AZ.page, pages - 1);
  const ymax = .5, spark = (p) => { const W = 120, H = 26, xx = (i) => 2 + i * (W - 4) / 9, yy = (v) => H - 2 - Math.min(1, (v || 0) / ymax) * (H - 4);
    const l = (arr, dash) => `<path d="${arr.slice(0, 10).map((v, i) => `${i ? "L" : "M"}${xx(i).toFixed(1)} ${yy(v).toFixed(1)}`).join("")}" fill="none" stroke="${dash ? "rgba(255,255,255,.55)" : CLSC[p.cls] || "#cfd5d1"}" stroke-width="1.5"${dash ? ' stroke-dasharray="3 2"' : ""}/>`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:120px;height:26px">${l(p.r, 1)}${l(p.p)}</svg>`; };
  const cols = [["pid", "Polygon"], ["region", "Region"], ["cls", "Class"], ["area", "Area m²", 1], ["bsi", "BSI-E", 1], ["d", "ΔBSI-E ring", 1], ["ndvi", "NDVI", 1], ["mndwi", "MNDWI", 1], ["", "Spectrum (— polygon, ‒ ‒ ring)"]];
  $("#azPl").innerHTML = `<table class="az-tbl"><thead><tr>${cols.map(([k, n, num]) => `<th data-k="${k}" class="${num ? "num" : ""}">${n}${k && k === sk ? (sd > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody>${P.slice(AZ.page * per, AZ.page * per + per).map((p) => {
    const go = hasImg(p.op);
    return `<tr class="${go ? "go" : ""}" data-op="${esc(p.op)}"><td class="mono">${esc(pidName(p))}${p.low ? ` <span title="few valid pixels" style="color:var(--warn)">•</span>` : ""}</td><td>${esc(regionName(p.region))}</td>
      <td><span class="pill"><i style="background:${CLSC[p.cls] || "#6b7178"}"></i>${esc(CLSN[p.cls] || "Unlabelled")}</span>${p.qc ? ` <span style="color:${QCC[p.qc] || "#9aa29c"};font-size:11px">· farm ${esc(p.qc)}</span>` : ""}</td>
      <td class="num mono">${fmt(p.area)}</td><td class="num mono" style="color:${p.p[10] < .3 ? "#7fb8ff" : "inherit"}">${fmt(p.p[10], 2)}</td><td class="num mono">${fmt(val.d(p), 2)}</td><td class="num mono">${fmt(p.p[11], 2)}</td><td class="num mono">${fmt(p.p[13], 2)}</td><td>${spark(p)}</td></tr>`; }).join("")}</tbody></table>`;
  $("#azPlN").textContent = `${fmt(P.length)} polygons`;
  $("#azPg").innerHTML = `<button id="pgP"${AZ.page ? "" : " disabled"}>‹ Prev</button><span>page ${AZ.page + 1} of ${pages}</span><button id="pgN"${AZ.page < pages - 1 ? "" : " disabled"}>Next ›</button>`;
  $("#pgP").onclick = () => { AZ.page--; drawPolys(); }; $("#pgN").onclick = () => { AZ.page++; drawPolys(); };
  document.querySelectorAll("#azPl th[data-k]").forEach((th) => { if (!th.dataset.k) return; th.onclick = () => { const k = th.dataset.k; AZ.sort = [k, sk === k ? -sd : -1]; drawPolys(); }; });
  document.querySelectorAll("#azPl tr.go").forEach((tr) => tr.onclick = () => openFarm(tr.dataset.op));
}

// ============================================================================ seasonal (main dashboard)
const lowMonth = (m) => m.pond_m2 == null || (m.clear_days ?? 0) < 1.5 || (m.valid_frac ?? 0) < .6;
function seasonCycle(d) {   // median across years of pond area per calendar month (reliable months only)
  return d3.range(12).map((i) => { const v = d.months.filter((m) => +m.month.slice(5) === i + 1 && !lowMonth(m)).map((m) => m.pond_m2); return v.length ? d3.median(v) : null; });
}
const winMonths = (d) => d.hemisphere === "S" ? [12, 1, 2, 3] : [6, 7, 8, 9];
function fillSeason(op) {
  const slot = document.getElementById("seasonSlot"); if (!slot) return;
  const d = MONTHLY[op]; if (!d) { slot.remove(); return; }
  const W = 356, H = 170, m = { l: 36, r: 8, t: 12, b: 22 }, x = d3.scaleLinear([1, 12], [m.l, W - m.r]), years = [...new Set(d.months.map((r) => +r.month.slice(0, 4)))];
  const ymax = d3.max(d.months, (r) => r.pond_m2) || 1, y = d3.scaleLinear([0, ymax * 1.1], [H - m.b, m.t]), win = winMonths(d);
  let s = win.map((mo) => `<rect x="${x(mo) - (W - m.l - m.r) / 22}" width="${(W - m.l - m.r) / 11}" y="${m.t}" height="${H - m.t - m.b}" fill="rgba(236,132,84,.10)"/>`).join("");
  s += `<text x="${x(win[0] === 12 ? 1 : win[0]) - 4}" y="${m.t + 8}" font-size="8.5" fill="rgba(236,132,84,.85)">${win[0] === 12 ? "" : "yearly window"}</text>`;
  y.ticks(3).forEach((t) => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 4}" y="${y(t) + 3}" text-anchor="end" font-size="9.5">${kfmt(t)}</text>`; });
  MONL.forEach((n, i) => { s += `<text x="${x(i + 1)}" y="${H - 6}" text-anchor="middle" font-size="9">${n[0]}</text>`; });
  years.forEach((yr) => { const rows = d3.range(12).map((i) => d.months.find((r) => r.month === `${yr}-${String(i + 1).padStart(2, "0")}`));
    const pts = rows.map((r, i) => [x(i + 1), r && r.pond_m2 != null ? y(r.pond_m2) : null, r]);
    const ln = d3.line().defined((p) => p[1] != null).curve(d3.curveMonotoneX)(pts), c = YCOL[yr] || "#cfd5d1";
    s += `<path pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" d="${ln}" fill="none" stroke="${c}" stroke-width="${yr === years[years.length - 1] ? 2.4 : 1.8}">${LN_ANIM}</path>` +
      pts.map((p, i) => p[1] == null ? "" : `<circle cx="${p[0]}" cy="${p[1]}" r="${lowMonth(p[2]) ? 2.6 : 2.4}" fill="${lowMonth(p[2]) ? "rgba(20,22,26,.9)" : c}" stroke="${c}" opacity="0">${dotAnim((LN_T * i / 11).toFixed(2))}<title>${MONL[i]} ${yr}: ${fmt(p[2].pond_m2)} m² · ${fmt(p[2].clear_days, 0)} clear days</title></circle>`).join("") + ballSvg(ln, c); });
  // heat strip: wet fraction per 2025 polygon per month
  const ponds = d.ponds.slice(0, 6), cols = d.months.length, hx = 52, cw = (W - hx - 4) / cols, rh = 11, HH = 18 + ponds.length * rh + 14;
  let h = `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="4" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/></pattern></defs>`;
  const wc = d3.scaleSequential([0, 1], d3.interpolateRgbBasis(["#22262c", "#24476e", "#3987e5", "#9fd0ff"]));
  ponds.forEach((p, i) => { h += `<text x="${hx - 6}" y="${16 + i * rh + 8}" text-anchor="end" font-size="8.5" font-family="IBM Plex Mono">${esc(p.pid.split("_").pop())}</text>`;
    d.months.forEach((r, j) => { const v = (r.ponds.find((z) => z.pid === p.pid) || {}).wet, bad = v == null || (r.clear_days ?? 0) < 1.5;
      h += `<rect class="c" x="${hx + j * cw}" y="${16 + i * rh}" width="${cw - .6}" height="${rh - 1.2}" rx="1.2" fill="${bad ? "url(#hatch)" : wc(v)}"><title>${esc(p.pid.split("_").pop())} · ${r.month}: ${bad ? "no clear view" : Math.round(v * 100) + "% wet"}</title></rect>`; }); });
  years.forEach((yr, k) => { const j = d.months.findIndex((r) => r.month.startsWith(yr)); if (j < 0) return;
    h += `<text x="${hx + j * cw}" y="10" font-size="9" font-weight="700" style="fill:${YCOL[yr] || "#fff"}">${yr}</text>` + (k ? `<line x1="${hx + j * cw - .3}" x2="${hx + j * cw - .3}" y1="12" y2="${16 + ponds.length * rh}" stroke="rgba(255,255,255,.5)"/>` : ""); });
  h += `<text x="${hx}" y="${HH - 2}" font-size="8.5" fill="rgba(236,241,238,.55)">Shade: share of polygon pixels with BSI-E &lt; 0.30 · hatched: no cloud-free observation</text>`;
  const cyc = seasonCycle(d), pk = d3.maxIndex(cyc, (v) => v ?? -1), lo = d3.minIndex(cyc, (v) => v ?? Infinity), wv = d3.mean(win.map((mo) => cyc[mo - 1]).filter((v) => v != null));
  const say = cyc[pk] ? `Pond area peaks in <b>${MONL[pk]}</b> (${kfmt(cyc[pk])} m²) and is lowest in <b>${MONL[lo]}</b>; the annual summer window captures <b>${Math.round(100 * (wv || 0) / cyc[pk])}%</b> of peak extent.` : "Insufficient cloud-free months.";
  slot.outerHTML = `<div class="card season"><h3>Pond area by month · 2023–2025</h3><p class="say">${say}</p><svg viewBox="-14 0 ${W + 14} ${H + 13}">${s}${axT(W, H, "Month", "Pond area (m²)")}</svg>
    <div class="keys">${years.map((yr) => lineKey(YCOL[yr] || "#cfd5d1", String(yr), { w: 2.2 })).join("")}<span><i style="background:rgba(20,22,26,.9);border:1px solid #cfd5d1;border-radius:50%"></i>few clear days</span><span><i style="background:rgba(236,132,84,.3)"></i>yearly window</span></div>
    <svg class="hm" viewBox="0 0 ${W} ${HH}" style="margin-top:8px">${h}</svg>
    <p class="note">Monthly Sentinel-2 median composites; BSI-E &lt; 0.30 within the footprint. Monthly data cover ${Object.keys(MONTHLY).length} farms: every US farm with a BSI pond, three reviewer-confirmed farms per other country, and the five largest BSI ponds in Russia and New Zealand (few reviews there).</p></div>`;
}
// tier cards: seasonal sample in scope, and the link to the Analyzer
function cardSeasonScope(c, st) {
  const fs = Object.values(MONTHLY).filter((d) => (!c || d.country === c) && (!st || d.region === `USA/${st}`));
  if (!fs.length) return "";
  const W = 356, H = 150, m = { l: 30, r: 8, t: 10, b: 20 }, x = d3.scaleLinear([1, 12], [m.l, W - m.r]), y = d3.scaleLinear([0, 1.05], [H - m.b, m.t]);
  let s = "";
  [0, .5, 1].forEach((t) => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 4}" y="${y(t) + 3}" text-anchor="end" font-size="9.5">${t * 100}%</text>`; });
  MONL.forEach((n, i) => { s += `<text x="${x(i + 1)}" y="${H - 5}" text-anchor="middle" font-size="9">${n[0]}</text>`; });
  const byC = d3.group(fs, (d) => d.country), keys = [];
  fs.forEach((d) => { const cy = seasonCycle(d), mx = d3.max(cy) || 1, col = SEAS[d.country] || "#cfd5d1";
    s += `<path d="${d3.line().defined((v) => v != null).curve(d3.curveMonotoneX)(cy.map((v, i) => [x(i + 1), v == null ? null : y(v / mx)]))}" fill="none" stroke="${col}" stroke-width="1" stroke-opacity="${Math.min(.22, 6 / fs.length).toFixed(3)}"/>`; });
  [...byC].forEach(([k, ds]) => { const col = SEAS[k] || "#cfd5d1", med = d3.range(12).map((i) => d3.median(ds.map((d) => { const cy = seasonCycle(d), mx = d3.max(cy) || 1; return cy[i] == null ? null : cy[i] / mx; }).filter((v) => v != null)) ?? null);
    const dd = d3.line().defined((v) => v != null).curve(d3.curveMonotoneX)(med.map((v, i) => [x(i + 1), v == null ? null : y(v)]));
    s += `<path pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" d="${dd}" fill="none" stroke="${col}" stroke-width="2.4">${LN_ANIM}</path>` + ballSvg(dd, col); keys.push(lineKey(col, `${COUNTRIES[k]?.name || k}${COUNTRIES[k] && ds[0].hemisphere === "S" ? " (S)" : ""}`)); });
  const withImg = fs.filter((d) => hasImg(d.operation_id)).sort((a, b) => (b.prod_area_ha || 0) - (a.prod_area_ha || 0)), more = Math.max(0, withImg.length - 10);
  const chips = withImg.slice(0, 10).map((d) => `<span data-op="${esc(d.operation_id)}">${esc(opShort(d.operation_id))}</span>`).join("") + (more ? `<i class="note" style="align-self:center;font-style:normal">+${more} more · open any farm with a BSI pond to see its months</i>` : "");
  return `<div class="card"><h3>Pond area by month</h3><p class="say">Monthly pond area as a share of each farm's peak (100%), median of 2023–2025. Thin lines: individual farms; bold: ${byC.size > 1 ? "country " : ""}median.</p>
    <svg viewBox="-14 0 ${W + 14} ${H + 13}">${s}${axT(W, H, "Month", "Share of farm peak")}</svg>${byC.size > 1 || keys.length ? `<div class="keys">${keys.join("")}</div>` : ""}${chips ? `<div class="sfarms" title="Open a sample farm">${chips}</div>` : ""}
    <p class="note">${fs.length} farm${fs.length > 1 ? "s" : ""} with monthly Sentinel-2 composites${chips ? "; chips show the largest ponds" : ""}. (S): southern hemisphere, summer Dec–Mar.</p></div>`;
}
function cardAnzLink(region, name) {
  return `<div class="card azlink" data-anz="${esc(region)}">Analyzer: QC outcomes and false-positive spectra for ${esc(name)}<span>open ›</span></div>`;
}
function wireExtra() {
  document.querySelectorAll("#rcol .sfarms span").forEach((el) => el.onclick = () => goFarm(el.dataset.op));
  document.querySelectorAll("#rcol [data-anz]").forEach((el) => el.onclick = () => setTab("anz", el.dataset.anz));
}

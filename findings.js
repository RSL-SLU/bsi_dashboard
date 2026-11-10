"use strict";
// ============================================================================ one highlighted finding per data card
// Loaded last. Wraps the card builders of index_v1 (tier and farm cards), analyzer.js and casestudy.js, computes one
// short data-driven sentence for the current scope, and adds it to the card as a .fnd line. Cards that already carry a
// findings list (Key observations, Key separability findings) or that are tables/navigation are left as they are.
document.head.insertAdjacentHTML("beforeend", `<style>
.fnd{display:flex;gap:8px;align-items:baseline;margin:8px 0 2px;padding:6px 10px;border-radius:10px;background:linear-gradient(90deg,rgba(236,132,84,.16),rgba(236,132,84,.03));border-left:3px solid var(--accent);font-size:12.5px;line-height:1.4;color:var(--ink)}
.fnd::before{content:"Finding";flex:none;font:700 9.5px var(--fb);letter-spacing:.08em;text-transform:uppercase;color:#ffb48f}
.fnd b{color:#fff}
</style>`);
const FND = (s) => s ? `<div class="fnd"><span>${s}</span></div>` : "";
const addF = (html, s) => html && s ? html.replace(/<\/div>\s*$/, FND(s) + "</div>") : html;
function putF(sel, s) {   // set (or clear) the finding line of the card that holds sel
  const el = typeof sel === "string" ? document.querySelector(sel) : sel, card = el && el.closest(".card"); if (!card) return;
  let f = card.querySelector(":scope > .fnd"); if (!s) { if (f) f.remove(); return; }
  if (!f) { card.insertAdjacentHTML("beforeend", FND(s)); } else f.outerHTML = FND(s);
}
const wrapFn = (name, after) => { const fn = window[name]; if (typeof fn !== "function") return;
  window[name] = function (...a) { const r = fn.apply(this, a); try { const o = after(r, ...a); return o === undefined ? r : o; } catch (e) { console.warn("finding", name, e); return r; } }; };
const pc = (v) => Math.round(100 * v) + "%", rel = (v) => v.toFixed(2) + "×";
const ext = (vals) => { let lo = null, hi = null; vals.forEach((v, i) => { if (v == null) return; if (lo == null || v < vals[lo]) lo = i; if (hi == null || v > vals[hi]) hi = i; }); return [lo, hi]; };

// ---------------------------------------------------------------------------- map tier cards (return HTML)
wrapFn("cardIndex", (h, groups) => {
  const Y = DASH.years, g = groups.map(([n, v]) => { const [lo, hi] = ext(v); return { n, v, lo, hi, rng: lo == null ? null : v[hi] - v[lo] }; }).filter((x) => x.lo != null);
  if (!g.length) return;
  if (g.length === 1) { const x = g[0]; return addF(h, `Lowest year <b>${Y[x.lo]}</b> (${rel(x.v[x.lo])} the average); highest <b>${Y[x.hi]}</b> (${rel(x.v[x.hi])}).`); }
  const dip = g.reduce((a, b) => b.v[b.lo] < a.v[a.lo] ? b : a), calm = g.reduce((a, b) => b.rng < a.rng ? b : a);
  return addF(h, `Largest dip: <b>${esc(dip.n)}</b> in ${Y[dip.lo]} (${rel(dip.v[dip.lo])} its average). Most stable: <b>${esc(calm.n)}</b> (${rel(calm.v[calm.lo])}–${rel(calm.v[calm.hi])}).`);
});
wrapFn("cardSeasonScope", (h, c, st) => {
  if (!h) return;
  const fs = Object.values(MONTHLY).filter((d) => (!c || d.country === c) && (!st || d.region === `USA/${st}`));
  const rows = fs.map((d) => { const cy = seasonCycle(d), mx = d3.max(cy); if (!mx) return null;
    const w = d3.mean(winMonths(d).map((m) => cy[m - 1]).filter((v) => v != null)); return { pk: d3.maxIndex(cy, (v) => v ?? -1), share: w == null ? null : w / mx }; }).filter(Boolean);
  if (rows.length < 3) return;
  const top = [...d3.rollup(rows, (v) => v.length, (r) => r.pk)].sort((a, b) => b[1] - a[1])[0], share = d3.median(rows.filter((r) => r.share != null), (r) => r.share);
  return addF(h, `Most common peak month: <b>${MONL[top[0]]}</b> (${top[1]} of ${rows.length} farms). The yearly summer window reaches a median <b>${pc(share || 0)}</b> of each farm's peak.`);
});
wrapFn("cardPrecision", (h, us, noun) => {
  if (!h) return;
  const rows = us.filter((u) => u.prec && u.prec.n >= 10), low = rows.filter((u) => u.prec.precision < .5), med = d3.median(rows, (u) => u.prec.precision);
  const pl = noun === "country" ? "countries" : noun + "s";
  return addF(h, low.length ? `<b>${low.length} of ${rows.length}</b> ${pl} are below 50% precision (${low.map((u) => esc(u.name)).join(", ")}); median ${pc(med)}.`
    : `Every ${noun} is above 50% precision; median <b>${pc(med)}</b>.`);
});
wrapFn("cardVerdicts", (h, us) => {
  if (!h) return;
  const g = sumOf(us.flatMap((u) => u.regs), "fp", FPK), T = d3.sum(Object.values(g)); if (!T) return;
  const [k, n] = Object.entries(g).sort((a, b) => b[1] - a[1])[0], lab = (FPK.find((x) => x[0] === k) || [, human(k)])[1];
  return addF(h, `Most incorrect detections were <b>${esc(lab.toLowerCase())}</b> (${n} of ${T}).`);
});
wrapFn("cardEvents", (h, fs) => {
  if (!h) return;
  const K = [["new", "new"], ["removed", "removed"], ["transient", "intermittent"], ["seasonal", "seasonal"], ["one_off", "single-year"]];
  const tot = K.map(([k, n]) => [n, d3.sum(fs, (f) => f.events[k] || 0)]).sort((a, b) => b[1] - a[1]), rem = fs.filter((f) => f.events.removed).length;
  if (!tot[0][1]) return;
  return addF(h, `Most common pattern: <b>${tot[0][0]}</b> (${fmt(tot[0][1])} ponds).${rem ? ` <b>${rem}</b> farm${rem > 1 ? "s" : ""} lost a pond after an earlier detection.` : ""}`);
});
wrapFn("cardFarms", (h, list) => {
  if (!h) return;
  const ch = list.map((p) => { const f = DASH.farms.find((x) => x.op === p.op), v = f ? change(f) : null; return { op: p.op, v }; }).filter((x) => x.v != null && isFinite(x.v));
  if (ch.length < 2) return;
  const up = ch.reduce((a, b) => b.v > a.v ? b : a), dn = ch.reduce((a, b) => b.v < a.v ? b : a);
  return addF(h, `Largest increase <b>${esc(up.op)}</b> (${pct(up.v)}); largest decrease <b>${esc(dn.op)}</b> (${pct(dn.v)}).`);
});
wrapFn("rcolFarm", () => {   // farm: pond area per year
  const ys = (F.data.history.years || []).filter((y) => y.pond_area_m2 != null && !y.thin); if (ys.length < 2) return;
  const hi = ys.reduce((a, b) => b.pond_area_m2 > a.pond_area_m2 ? b : a), lo = ys.reduce((a, b) => b.pond_area_m2 < a.pond_area_m2 ? b : a);
  const zero = ys.filter((y) => !y.pond_area_m2).map((y) => y.year);
  putF("#area", `Peak <b>${hi.year}</b> (${fmt(hi.pond_area_m2)} m²); lowest <b>${lo.year}</b> (${fmt(lo.pond_area_m2)} m²).${zero.length ? ` No pond detected in ${zero.join(", ")}.` : ""}`);
});

// ---------------------------------------------------------------------------- Analyzer cards (draw into the DOM)
const fpFeat = (k) => (CLS.find((c) => c[0] === k) || [, human(k)])[1];
wrapFn("drawSankey", () => {
  const ops = ANZ.ops.filter((o) => inRegion(o.region) && o.qc && o.npoly > 0), bad = ops.filter((o) => o.qc === "incorrect");
  if (!bad.length) return putF("#azSk", null);
  const [f, n] = [...d3.rollup(bad, (v) => v.length, (o) => o.feat || "unknown")].sort((a, b) => b[1] - a[1])[0];
  putF("#azSk", `<b>${pc(bad.length / ops.length)}</b> of ${ops.length} reviewed BSI detections were incorrect; the largest share were <b>${esc(human(f))}</b> (${n}).`);
});
wrapFn("drawIssues", () => {
  const ops = ANZ.ops.filter((o) => inRegion(o.region) && o.qc), fl = ops.filter((o) => o.issue && o.issue !== "none");
  if (!fl.length) return putF("#azIs", null);
  const [is, n] = [...d3.rollup(fl, (v) => v.length, (o) => o.issue)].sort((a, b) => b[1] - a[1])[0];
  const by = [...d3.group(ops, (o) => o.region)].filter(([, v]) => v.length >= 10).map(([r, v]) => [r, v.filter((o) => o.issue === is).length / v.length]).sort((a, b) => b[1] - a[1])[0];
  putF("#azIs", `Most flagged issue: <b>${esc(human(is))}</b> (${n} farms)${by && by[1] > 0 ? `, most often in <b>${esc(regionName(by[0]))}</b> (${pc(by[1])} of its reviewed farms)` : ""}.`);
});
wrapFn("drawPrec", () => {
  const rows = precRows(); if (rows.length < 2) return putF("#azPr", null);
  const w = rows.map((d) => ({ d, ci: wilson(d.k, d.n) })).sort((a, b) => (b.ci[1] - b.ci[0]) - (a.ci[1] - a.ci[0]))[0];
  putF("#azPr", `Least certain: <b>${esc(w.d.name)}</b> (${w.d.n} reviewed detections, 95% interval ${pc(w.ci[0])}–${pc(w.ci[1])}). Differences smaller than the intervals are not meaningful.`);
});
wrapFn("drawAuc", () => {
  const T = sepTable(lab()); if (T.pond.length < 5 || !T.fps.length) return putF("#azAuc", null);
  const best = T.rows[0], bsi = T.rows.find((r) => r.f.k === "bsi_e");
  putF("#azAuc", `Best single feature: <b>${esc(best.f.name)}</b> (mean AUC ${best.mean.toFixed(2)}). BSI-E itself scores ${bsi ? bsi.mean.toFixed(2) : "–"}: the false positives it lets through look like ponds on BSI-E by construction.`);
});
wrapFn("drawScatter", () => {
  const T = sepTable(lab()), fx = FEATS[AZ.sx], fy = FEATS[AZ.sy]; if (T.pond.length < 5 || !T.fps.length || !fx || !fy) return putF("#azSc", null);
  const rx = T.rows.find((r) => r.f.k === fx.k), ry = T.rows.find((r) => r.f.k === fy.k); if (!rx || !ry) return;
  const g = T.fps.map((c, j) => ({ c, s: Math.max(rx.cells[j]?.s || .5, ry.cells[j]?.s || .5) })).sort((a, b) => a.s - b.s)[0];
  putF("#azSc", `On these two axes, <b>${esc(g.c.n.toLowerCase())}</b> overlaps most with confirmed ponds (best AUC ${g.s.toFixed(2)}); choose other axes to look for separation.`);
});
wrapFn("drawViolins", () => {
  const P = lab(), pond = P.filter((p) => p.cls === "manure_pond"); if (pond.length < 5) return putF("#azVio", null);
  const i = 10, med = (ps, f) => d3.median(ps, f), pm = med(pond, (p) => p.p[i]), rm = med(pond, (p) => p.r[i]);
  const g = CLS.filter(([k]) => k !== "manure_pond").map(([k, n]) => ({ n, ps: P.filter((p) => p.cls === k) })).filter((x) => x.ps.length >= 5).map((x) => ({ ...x, m: med(x.ps, (p) => p.p[i]) }))
    .sort((a, b) => Math.abs(a.m - pm) - Math.abs(b.m - pm))[0];
  putF("#azVio", `Confirmed ponds: median BSI-E <b>${fmt(pm, 2)}</b> against <b>${fmt(rm, 2)}</b> in their ring.${g ? ` Closest false-positive class on BSI-E: <b>${esc(g.n.toLowerCase())}</b> (${fmt(g.m, 2)}).` : ""}`);
});

// ---------------------------------------------------------------------------- Case studies cards
wrapFn("drawCsEvents", (r, st) => {
  const by = ["CHN", "USA"].map((c) => { const n = st.S.filter((s) => s.c === c).length, ev = st.ev.filter((e) => e.c === c);
    const top = [...d3.rollup(ev, (v) => v.length, (e) => e.cand)].sort((a, b) => b[1] - a[1])[0]; return { c, per: ev.length / Math.max(1, n), top }; });
  putF("#csEv", by.map((b) => `${CS_CN[b.c]}: <b>${b.per.toFixed(1)}</b> candidates per site, mostly ${b.top ? CS_EV[b.top[0]][0].toLowerCase() : "–"}`).join("; ") + ".");
});
wrapFn("drawCsHeat", () => {
  const part = ["USA", "CHN"].map((c) => { const S = CSD.sites.filter((s) => s.c === c);
    const lows = S.map((s) => { const ok = s.years.filter((y) => !y.thin && y.img === "ok" && y.a != null); return ok.length ? ok.reduce((a, b) => b.a < a.a ? b : a).y : null; }).filter(Boolean);
    const top = [...d3.rollup(lows, (v) => v.length, (y) => y)].sort((a, b) => b[1] - a[1])[0]; return top ? `in ${CS_CN[c]} the most common lowest year is <b>${top[0]}</b> (${top[1]} of ${S.length} sites)` : ""; }).filter(Boolean);
  putF("#csHm", part.length ? part.join("; ").replace(/^./, (m) => m.toUpperCase()) + "." : null);
});
wrapFn("drawCsArea", (r, s) => {
  const ok = s.years.filter((y) => !y.thin && y.img === "ok" && y.a != null); if (ok.length < 2) return putF("#csArea", null);
  const hi = ok.reduce((a, b) => b.a > a.a ? b : a), lo = ok.reduce((a, b) => b.a < a.a ? b : a), big = s.ponds.reduce((a, b) => (b.max || 0) > (a.max || 0) ? b : a, s.ponds[0]);
  putF("#csArea", `Site total peaks in <b>${hi.y}</b> (${fmt(hi.a)} m²) and is lowest in <b>${lo.y}</b> (${fmt(lo.a)} m²).${big ? ` Largest pond: <b>${big.short}</b> (${fmt(big.max)} m² at peak).` : ""}`);
});
wrapFn("drawCsPres", (r, s) => {
  const rel = s.years.map((y, i) => [y, i]).filter(([y]) => !y.thin && y.img === "ok");
  const always = s.ponds.filter((p) => rel.every(([, i]) => p.area[i] > 0)), once = s.ponds.filter((p) => rel.filter(([, i]) => p.area[i] > 0).length === 1);
  putF("#csPres", `<b>${always.length} of ${s.ponds.length}</b> ponds are detected in every reliable summer${always.length ? ` (${always.map((p) => p.short).join(", ")})` : ""}${once.length ? `; ${once.length} appear in a single year only` : ""}.`);
});
wrapFn("drawCsMap", (r, s) => {
  const i = s.years.findIndex((y) => y.y === CS.year); if (i < 0) return putF("#csMap", null);
  const on = s.ponds.filter((p) => p.area[i] > 0).length, clip = s.fp_type === "tile_square" ? " The footprint is a tile square, so nearby dark ground can count as pond." : "";
  putF("#csMap", `<b>${on} of ${s.ponds.length}</b> tracked ponds are detected in ${CS.year}.${clip}`);
});
// redraw what is already on screen
if (typeof S !== "undefined" && typeof refreshRcol === "function" && PTS.length) refreshRcol();

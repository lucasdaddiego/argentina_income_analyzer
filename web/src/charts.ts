import * as Plot from "@observablehq/plot";
import { fmtShort } from "./format";
import { percentileOfIncome } from "./stats";
import type { Aglomerado, CostLine, Decile, History, IncomeClass, Measure, Region, Splits } from "./types";

// Chart palette, sourced from CSS custom properties so the charts follow the light/dark theme.
// These defaults are the light values; refreshPalette() re-reads them before each render pass.
let INK = "#1A1A1A";
let ACCENT = "#2A5C8A";
let MUTED = "#8a8a86";
let POBRE = "#9a3b2e";
let OK = "#2f6b3a";
let PAPER = "#fafaf8";
let INK_RGB = "17, 17, 17";
let ACCENT_RGB = "42, 92, 138";

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Re-read the chart palette from CSS custom properties (picks up the active light/dark theme). */
export function refreshPalette(): void {
  INK = cssVar("--ink", INK);
  ACCENT = cssVar("--accent", ACCENT);
  MUTED = cssVar("--chart-muted", MUTED);
  POBRE = cssVar("--pobre", POBRE);
  OK = cssVar("--ok", OK);
  PAPER = cssVar("--paper", PAPER);
  INK_RGB = cssVar("--ink-rgb", INK_RGB);
  ACCENT_RGB = cssVar("--accent-rgb", ACCENT_RGB);
}

const inkA = (alpha: number | string) => `rgba(${INK_RGB}, ${alpha})`;
const accentA = (alpha: number | string) => `rgba(${ACCENT_RGB}, ${alpha})`;

function clear(el: HTMLElement) {
  el.replaceChildren();
}

// 95% sampling band for a percentile, in percentile points. A conservative design effect
// (deff ≈ 2) widens the simple binomial SE to allow for the EPH's complex sample design.
export function percentileMargin(m: Measure, pct: number): number {
  const p = Math.min(99.9, Math.max(0.1, pct)) / 100;
  const nEff = Math.max(1, m.n_unweighted / 2);
  return 1.96 * Math.sqrt((p * (1 - p)) / nEff) * 100;
}

// ---------------------------------------------------------------------------
// Thin percentile ruler (custom SVG) — the only chart-like element above the fold.
// ---------------------------------------------------------------------------
export function renderRuler(el: HTMLElement, m: Measure, pct: number) {
  const w = el.clientWidth || 680;
  const h = 70;
  const padL = 16;
  const padR = 16;
  const baseY = 46;
  const x = (p: number) => padL + (Math.min(100, Math.max(0, p)) / 100) * (w - padL - padR);
  const meanPct = percentileOfIncome(m, m.mean);
  const ux = x(Math.min(99.5, pct));
  const mx = x(meanPct);
  const ticks = [
    { p: 10, label: fmtShort(m.percentiles["10"]) },
    { p: 50, label: fmtShort(m.median) },
    { p: 90, label: fmtShort(m.percentiles["90"]) },
  ];

  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" font-family="inherit" style="display:block">`;
  s += `<line x1="${padL}" y1="${baseY}" x2="${w - padR}" y2="${baseY}" stroke="${inkA(0.25)}" stroke-width="1"/>`;
  for (const t of ticks) {
    const tx = x(t.p);
    s += `<line x1="${tx}" y1="${baseY - 4}" x2="${tx}" y2="${baseY + 4}" stroke="${inkA(0.3)}"/>`;
    s += `<text x="${tx}" y="${baseY + 18}" text-anchor="middle" font-size="10" fill="${MUTED}">p${t.p} · ${t.label}</text>`;
  }
  s += `<line x1="${mx}" y1="${baseY - 9}" x2="${mx}" y2="${baseY + 4}" stroke="${inkA(0.35)}" stroke-dasharray="2,2"/>`;
  s += `<text x="${mx}" y="${baseY - 12}" text-anchor="middle" font-size="9" fill="${MUTED}">media</text>`;
  // sampling-uncertainty band (95%) — it's a survey estimate, not a census point
  const margin = percentileMargin(m, pct);
  const bx0 = x(pct - margin);
  const bx1 = x(pct + margin);
  s += `<rect x="${bx0.toFixed(1)}" y="${baseY - 7}" width="${Math.max(2, bx1 - bx0).toFixed(1)}" height="14" fill="${ACCENT}" fill-opacity="0.16"/>`;
  s += `<line x1="${ux}" y1="${baseY - 18}" x2="${ux}" y2="${baseY}" stroke="${ACCENT}" stroke-width="2"/>`;
  s += `<circle cx="${ux}" cy="${baseY}" r="5" fill="${ACCENT}" stroke="${PAPER}" stroke-width="1.5"/>`;
  const anchor = ux > w - 70 ? "end" : ux < 70 ? "start" : "middle";
  s += `<text x="${ux}" y="${baseY - 22}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="${ACCENT}">vos · p${Math.round(Math.min(99, pct))}</text>`;
  s += `</svg>`;
  el.innerHTML = s;
}

// ---------------------------------------------------------------------------
// Income-class scale (custom SVG): population sorted low→high, split into class
// bands by population share (so the x-axis is the percentile), with the user marked.
// ---------------------------------------------------------------------------
export function renderClassScale(el: HTMLElement, m: Measure, classes: IncomeClass[], v: number) {
  const w = el.clientWidth || 680;
  const pad = 2;
  const x = (p: number) => pad + (Math.min(100, Math.max(0, p)) / 100) * (w - 2 * pad);
  const barY = 30;
  const barH = 30;
  const userPct = percentileOfIncome(m, v);

  const bands = classes.map((c) => ({
    ...c,
    loPct: percentileOfIncome(m, c.lo),
    hiPct: c.hi === Infinity ? 100 : percentileOfIncome(m, c.hi),
  }));

  let s = `<svg viewBox="0 0 ${w} 76" width="100%" height="76" font-family="inherit" style="display:block">`;
  for (const c of bands) {
    const x0 = x(c.loPct);
    const segW = x(c.hiPct) - x0;
    if (segW <= 0.5) continue;
    const share = c.hiPct - c.loPct;
    s += `<rect x="${x0.toFixed(1)}" y="${barY}" width="${Math.max(0, segW - 1).toFixed(1)}" height="${barH}" fill="${c.color}"><title>${c.name}: ${share.toFixed(0)}% de la población</title></rect>`;
    if (segW > 58) {
      s += `<text x="${(x0 + segW / 2).toFixed(1)}" y="${barY + barH / 2 + 3.5}" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">${c.short}</text>`;
      s += `<text x="${(x0 + segW / 2).toFixed(1)}" y="${barY + barH + 13}" text-anchor="middle" font-size="9" fill="${MUTED}">${Math.round(share)}%</text>`;
    }
  }

  const ux = x(userPct);
  const anchor = ux > w - 70 ? "end" : ux < 70 ? "start" : "middle";
  s += `<line x1="${ux.toFixed(1)}" y1="${barY - 9}" x2="${ux.toFixed(1)}" y2="${barY + barH}" stroke="${INK}" stroke-width="2"/>`;
  s += `<circle cx="${ux.toFixed(1)}" cy="${barY - 9}" r="4" fill="${INK}" stroke="${PAPER}" stroke-width="1.5"/>`;
  s += `<text x="${ux.toFixed(1)}" y="${barY - 14}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="${INK}">vos · p${Math.round(Math.min(99, userPct))}</text>`;
  s += `</svg>`;
  el.innerHTML = s;
}

// ---------------------------------------------------------------------------
// Poverty number-line (custom SVG): $0 → with CBA, CBT and the user marked.
// ---------------------------------------------------------------------------
export function renderNumberLine(el: HTMLElement, ipcf: number, cba: number, cbt: number) {
  const w = el.clientWidth || 640;
  const h = 82;
  const padL = 14;
  const padR = 14;
  const baseY = 42;
  const scaleMax = cbt * 2.5; // scale to the canasta, not to an outlier income
  const off = ipcf > scaleMax;
  const x = (v: number) => padL + (Math.min(v, scaleMax) / scaleMax) * (w - padL - padR);

  const mark = (v: number, color: string, label: string, up: boolean) => {
    const px = x(v);
    const y1 = up ? baseY - 16 : baseY;
    const y2 = up ? baseY : baseY + 16;
    const ty = up ? baseY - 20 : baseY + 30;
    const anchor = px > w - 70 ? "end" : px < 60 ? "start" : "middle";
    return (
      `<line x1="${px}" y1="${y1}" x2="${px}" y2="${y2}" stroke="${color}" stroke-width="${up ? 2 : 1.5}"/>` +
      (up ? `<circle cx="${px}" cy="${baseY}" r="5" fill="${color}" stroke="${PAPER}" stroke-width="1.5"/>` : "") +
      `<text x="${px}" y="${ty}" text-anchor="${anchor}" font-size="10" fill="${color}" font-weight="${up ? 700 : 400}">${label}</text>`
    );
  };

  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" font-family="inherit" style="display:block">`;
  s += `<line x1="${padL}" y1="${baseY}" x2="${w - padR}" y2="${baseY}" stroke="${inkA(0.2)}"/>`;
  s += mark(cba, MUTED, `indigencia ${fmtShort(cba)}`, false);
  s += mark(cbt, POBRE, `pobreza ${fmtShort(cbt)}`, false);
  s += mark(ipcf, ACCENT, off ? `vos ▸ ${fmtShort(ipcf)}` : `vos ${fmtShort(ipcf)}`, true);
  s += `</svg>`;
  el.innerHTML = s;
}

// ---------------------------------------------------------------------------
// 100%-stacked income-share bar (custom SVG), one segment per decile.
// ---------------------------------------------------------------------------
export function renderShareBar(el: HTMLElement, m: Measure, userDecile: number) {
  const w = el.clientWidth || 680;
  const h = 48;
  const barY = 18;
  const barH = 24;
  let xacc = 0;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" font-family="inherit" style="display:block">`;
  for (const d of m.deciles) {
    const segW = (d.share / 100) * w;
    const col = accentA((0.13 + 0.085 * (d.decile - 1)).toFixed(3));
    const isUser = d.decile === userDecile;
    s += `<rect x="${xacc.toFixed(2)}" y="${barY}" width="${Math.max(0, segW - 1).toFixed(2)}" height="${barH}" fill="${col}"${isUser ? ` stroke="${INK}" stroke-width="1.5"` : ""}>`;
    s += `<title>Decil ${d.decile}: ${d.share}% del ingreso · ${(d.population / 1e6).toFixed(1)}M personas</title></rect>`;
    if (isUser) {
      const cx = xacc + segW / 2;
      const anchor = cx > w - 30 ? "end" : cx < 30 ? "start" : "middle";
      s += `<text x="${cx.toFixed(1)}" y="12" text-anchor="${anchor}" font-size="9" fill="${ACCENT}" font-weight="700">tu decil</text>`;
    }
    xacc += segW;
  }
  s += `</svg>`;
  el.innerHTML = s;
}

// ---------------------------------------------------------------------------
// Decile mean income bars (Observable Plot), user's decile in accent.
// ---------------------------------------------------------------------------
export function renderDecileBars(el: HTMLElement, m: Measure, userDecile: number) {
  clear(el);
  const data = m.deciles.map((d) => ({ ...d, label: `D${d.decile}` }));
  const order = data.map((d) => d.label).reverse(); // D10 at top
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 280,
    marginLeft: 38,
    marginRight: 64,
    x: { axis: null },
    y: { domain: order, label: null },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.barX(data, { x: "mean", y: "label", fill: inkA(0.12), inset: 1 }),
      Plot.barX(
        data.filter((d) => d.decile === userDecile),
        { x: "mean", y: "label", fill: ACCENT, inset: 1 }
      ),
      Plot.text(data, {
        x: "mean",
        y: "label",
        text: (d) => fmtShort(d.mean),
        dx: 6,
        textAnchor: "start",
        fill: MUTED,
        fontSize: 10,
      }),
      Plot.ruleX([0], { stroke: INK, strokeOpacity: 0.2 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Empirical CDF (Observable Plot), adaptive x-axis, user marker.
// ---------------------------------------------------------------------------
export function renderCDF(el: HTMLElement, m: Measure, userX: number, userPct: number) {
  clear(el);
  const pts = Object.keys(m.percentiles)
    .map((p) => ({ income: m.percentiles[p], pct: Number(p) }))
    .sort((a, b) => a.income - b.income);
  const cap = m.cap || pts[pts.length - 1].income;
  const domainMax = Math.max(cap, userX);
  const data = pts.filter((d) => d.income <= domainMax);
  if (userX > data[data.length - 1].income) data.push({ income: userX, pct: Math.min(99.99, userPct) });
  const markY = Math.min(userPct, 99.99);
  const nearEdge = userX >= domainMax * 0.9;

  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 320,
    marginLeft: 48,
    marginRight: 24,
    marginBottom: 44,
    x: { label: "Ingreso por persona →", domain: [0, domainMax], tickFormat: (d: number) => fmtShort(d), grid: true },
    y: { label: "↑ % que gana menos", domain: [0, 100], tickFormat: (d: number) => d + "%" },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "12px" },
    marks: [
      Plot.areaY(data, { x: "income", y: "pct", fill: ACCENT, fillOpacity: 0.08, curve: "step-after" }),
      Plot.lineY(data, { x: "income", y: "pct", stroke: ACCENT, strokeWidth: 2, curve: "step-after" }),
      Plot.ruleX([userX], { stroke: INK, strokeDasharray: "3,3", strokeOpacity: 0.5 }),
      Plot.ruleY([userPct], { stroke: INK, strokeDasharray: "3,3", strokeOpacity: 0.5 }),
      Plot.dot([{ x: userX, y: markY }], { x: "x", y: "y", r: 5, fill: ACCENT, stroke: PAPER, strokeWidth: 1.5 }),
      Plot.text([{ x: userX, y: markY }], {
        x: "x", y: "y", text: () => `vos · p${Math.min(99, Math.round(userPct))}`,
        dy: -12, dx: nearEdge ? -6 : 0, fill: ACCENT, fontWeight: 600, textAnchor: nearEdge ? "end" : "middle",
      }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Weighted histogram (Observable Plot) with median & mean reference rules.
// ---------------------------------------------------------------------------
export function renderHistogram(el: HTMLElement, m: Measure, userX: number) {
  clear(el);
  const { edges, counts } = m.histogram;
  const total = counts.reduce((a, b) => a + b, 0);
  const bins = counts.map((c, i) => ({
    x0: edges[i],
    x1: edges[i + 1],
    share: (c / total) * 100,
    user: userX >= edges[i] && (userX < edges[i + 1] || (i === counts.length - 1 && userX >= edges[i])),
  }));
  const cap = edges[edges.length - 1];

  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 300,
    marginLeft: 48,
    marginRight: 16,
    marginBottom: 44,
    x: { label: "Ingreso por persona →", tickFormat: (d: number) => fmtShort(d), domain: [0, cap] },
    y: { label: "↑ % de la población", tickFormat: (d: number) => d + "%", grid: true },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "12px" },
    marks: [
      Plot.rectY(bins, { x1: "x0", x2: "x1", y: "share", fill: (d: any) => (d.user ? ACCENT : inkA(0.14)), inset: 0.5 }),
      Plot.ruleX([m.median], { stroke: INK, strokeOpacity: 0.55, strokeDasharray: "4,3" }),
      Plot.ruleX([m.mean], { stroke: INK, strokeOpacity: 0.35, strokeDasharray: "1,3" }),
      Plot.text([{ x: m.median }], { x: "x", y: 0, frameAnchor: "top", text: () => "mediana", dy: 2, dx: -4, textAnchor: "end", fill: MUTED, fontSize: 10 }),
      Plot.text([{ x: m.mean }], { x: "x", y: 0, frameAnchor: "top", text: () => "media", dy: 2, dx: 4, textAnchor: "start", fill: MUTED, fontSize: 10 }),
      Plot.ruleY([0], { stroke: INK, strokeOpacity: 0.2 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Lorenz curve (Observable Plot) with the equality line.
// ---------------------------------------------------------------------------
export function renderLorenz(el: HTMLElement, m: Measure) {
  clear(el);
  const data = m.lorenz.map(([pop, inc]) => ({ pop: pop * 100, inc: inc * 100 }));
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 460,
    marginLeft: 52,
    marginBottom: 46,
    x: { label: "% acumulado de la población →", domain: [0, 100], tickFormat: (d: number) => d + "%" },
    y: { label: "↑ % acumulado del ingreso", domain: [0, 100], tickFormat: (d: number) => d + "%", grid: true },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "12px" },
    marks: [
      Plot.line([{ pop: 0, inc: 0 }, { pop: 100, inc: 100 }], { x: "pop", y: "inc", stroke: MUTED, strokeDasharray: "4,4" }),
      Plot.areaY(data, { x: "pop", y: "inc", fill: ACCENT, fillOpacity: 0.07 }),
      Plot.line(data, { x: "pop", y: "inc", stroke: ACCENT, strokeWidth: 2 }),
      Plot.text([{ pop: 72, inc: 88 }], { x: "pop", y: "inc", text: () => "igualdad perfecta", fill: MUTED, fontSize: 11, rotate: -34 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Regional median IPCF (Observable Plot) with the user's income as a reference.
// ---------------------------------------------------------------------------
export function renderRegions(el: HTMLElement, regions: Region[], userIpcf: number) {
  clear(el);
  const data = regions.map((r) => ({ ...r, label: r.name }));
  const order = data.map((d) => d.label); // already sorted by median (desc) = top→bottom
  const maxMedian = Math.max(...data.map((d) => d.median));
  const domainMax = maxMedian * 1.18; // scale to the regions, not to an outlier income
  const above = data.filter((d) => userIpcf >= d.median);
  const below = data.filter((d) => userIpcf < d.median);
  const off = userIpcf > domainMax;
  const markX = Math.min(userIpcf, domainMax);
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 250,
    marginLeft: 150,
    marginRight: 80,
    x: { axis: null, domain: [0, domainMax] },
    y: { domain: order, label: null },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.barX(below, { x: "median", y: "label", fill: inkA(0.12), inset: 1 }),
      Plot.barX(above, { x: "median", y: "label", fill: ACCENT, fillOpacity: 0.55, inset: 1 }),
      Plot.text(data, { x: "median", y: "label", text: (d) => fmtShort(d.median), dx: 6, textAnchor: "start", fill: MUTED, fontSize: 10 }),
      Plot.ruleX([markX], { stroke: ACCENT, strokeWidth: 2, strokeDasharray: "3,2" }),
      Plot.text([{ x: markX }], { x: "x", frameAnchor: "top", text: () => (off ? `vos ▸ ${fmtShort(userIpcf)}` : "vos"), dy: -2, dx: off ? -4 : 4, fill: ACCENT, fontSize: 10, fontWeight: 700, textAnchor: off ? "end" : "start" }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Aglomerado-level IPCF medians (32 EPH cities), same shape as renderRegions but finer.
// ---------------------------------------------------------------------------
export function renderAglomerados(el: HTMLElement, aglos: Aglomerado[], userIpcf: number) {
  clear(el);
  const data = aglos.map((a) => ({ ...a, label: a.name }));
  const order = data.map((d) => d.label); // already sorted by median (desc)
  const maxMedian = Math.max(...data.map((d) => d.median));
  const domainMax = maxMedian * 1.15;
  const above = data.filter((d) => userIpcf >= d.median);
  const below = data.filter((d) => userIpcf < d.median);
  const off = userIpcf > domainMax;
  const markX = Math.min(userIpcf, domainMax);
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: data.length * 17 + 26,
    marginLeft: 184,
    marginRight: 72,
    x: { axis: null, domain: [0, domainMax] },
    y: { domain: order, label: null },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "10px" },
    marks: [
      Plot.barX(below, { x: "median", y: "label", fill: inkA(0.12), inset: 1 }),
      Plot.barX(above, { x: "median", y: "label", fill: ACCENT, fillOpacity: 0.55, inset: 1 }),
      Plot.text(data, { x: "median", y: "label", text: (d) => fmtShort(d.median), dx: 5, textAnchor: "start", fill: MUTED, fontSize: 9 }),
      Plot.ruleX([markX], { stroke: ACCENT, strokeWidth: 2, strokeDasharray: "3,2" }),
      Plot.text([{ x: markX }], { x: "x", frameAnchor: "top", text: () => (off ? `vos ▸ ${fmtShort(userIpcf)}` : "vos"), dy: -2, dx: off ? -4 : 4, fill: ACCENT, fontSize: 10, fontWeight: 700, textAnchor: off ? "end" : "start" }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Real median vs real minimum wage over quarters (both deflated to "pesos de hoy").
// ---------------------------------------------------------------------------
export function renderTrendRealVsSmvm(
  el: HTMLElement,
  median: History["median_ipcf_quarterly"],
  smvm: History["smvm_quarterly"],
  cpi: History["cpi_quarterly"]
) {
  clear(el);
  if (!median.length) return;
  const idx = new Map(cpi.map((c) => [c.period, c.index]));
  const sm = new Map(smvm.map((s) => [s.period, s.smvm]));
  const MED = "Mediana (real)";
  const SMV = "Salario mínimo (real)";
  const data: { period: string; value: number; serie: string }[] = [];
  for (const p of median) {
    const ci = idx.get(p.period);
    if (!ci) continue;
    data.push({ period: p.period, value: Math.round((p.median * 100) / ci), serie: MED });
    const s = sm.get(p.period);
    if (s) data.push({ period: p.period, value: Math.round((s * 100) / ci), serie: SMV });
  }
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 300,
    marginLeft: 52,
    marginBottom: 48,
    x: { label: null, domain: median.map((p) => p.period), tickRotate: -40 },
    y: { label: "↑ pesos de hoy", grid: true, tickFormat: (d: number) => fmtShort(d) },
    color: { domain: [MED, SMV], range: [ACCENT, inkA(0.5)], legend: true },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.line(data, { x: "period", y: "value", stroke: "serie", strokeWidth: 2 }),
      Plot.dot(data, { x: "period", y: "value", fill: "serie", r: 3 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// "Canastas por decil": how many poverty baskets each decile's mean income buys.
// ---------------------------------------------------------------------------
export function renderCanastas(el: HTMLElement, deciles: Decile[], cbt: number, userDecile: number) {
  clear(el);
  const data = deciles.map((d) => ({ label: `D${d.decile}`, decile: d.decile, canastas: d.mean / cbt }));
  const order = data.map((d) => d.label).reverse(); // D10 top
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 280,
    marginLeft: 38,
    marginRight: 56,
    x: { axis: null },
    y: { domain: order, label: null },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.barX(data, { x: "canastas", y: "label", fill: inkA(0.12), inset: 1 }),
      Plot.barX(data.filter((d) => d.decile === userDecile), { x: "canastas", y: "label", fill: ACCENT, inset: 1 }),
      Plot.text(data, { x: "canastas", y: "label", text: (d) => d.canastas.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "×", dx: 6, textAnchor: "start", fill: MUTED, fontSize: 10 }),
      Plot.ruleX([1], { stroke: POBRE, strokeDasharray: "4,3" }),
      Plot.text([{ x: 1 }], { x: "x", frameAnchor: "top", text: () => "línea de pobreza", dy: -1, dx: 3, textAnchor: "start", fill: POBRE, fontSize: 9 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Trend: Gini over quarters.
// ---------------------------------------------------------------------------
export function renderTrendGini(el: HTMLElement, points: History["gini_quarterly"]) {
  clear(el);
  if (!points.length) return;
  const lo = Math.min(...points.map((p) => p.gini));
  const hi = Math.max(...points.map((p) => p.gini));
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 280,
    marginLeft: 44,
    marginBottom: 48,
    x: { label: null, domain: points.map((p) => p.period), tickRotate: points.length > 6 ? -40 : 0 },
    y: { label: "↑ Gini", grid: true, domain: [Math.max(0, lo - 0.01), hi + 0.01] },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.line(points, { x: "period", y: "gini", stroke: ACCENT, strokeWidth: 2 }),
      Plot.dot(points, { x: "period", y: "gini", fill: ACCENT, r: 3 }),
      Plot.text([points[points.length - 1]], { x: "period", y: "gini", text: (d: any) => d.gini.toFixed(3), dy: -10, fill: ACCENT, fontSize: 11, fontWeight: 700, textAnchor: "end" }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Trend: poverty & indigence (% of persons) over semesters.
// ---------------------------------------------------------------------------
export function renderTrendPoverty(el: HTMLElement, points: History["poverty_semestral"]) {
  clear(el);
  if (!points.length) return;
  const data = [
    ...points.map((p) => ({ period: p.period, value: p.poverty_pct, serie: "Pobreza" })),
    ...points.map((p) => ({ period: p.period, value: p.indigence_pct, serie: "Indigencia" })),
  ];
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 280,
    marginLeft: 44,
    marginBottom: 48,
    x: { label: null, domain: points.map((p) => p.period), tickRotate: points.length > 6 ? -40 : 0 },
    y: { label: "↑ % de personas", grid: true, domain: [0, Math.max(...points.map((p) => p.poverty_pct)) * 1.15] },
    color: { domain: ["Pobreza", "Indigencia"], range: [POBRE, inkA(0.45)] },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.line(data, { x: "period", y: "value", stroke: "serie", strokeWidth: 2 }),
      Plot.dot(data, { x: "period", y: "value", fill: "serie", r: 3 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Trend: median IPCF over quarters — nominal vs deflated to "pesos de hoy" (the gap is inflation).
// ---------------------------------------------------------------------------
export function renderTrendMedian(
  el: HTMLElement,
  points: History["median_ipcf_quarterly"],
  cpi: History["cpi_quarterly"]
) {
  clear(el);
  if (!points.length) return;
  const idx = new Map(cpi.map((c) => [c.period, c.index]));
  const REAL = "En pesos de hoy";
  const NOM = "Pesos corrientes";
  const data: { period: string; value: number; serie: string }[] = [];
  for (const p of points) {
    const ci = idx.get(p.period);
    if (ci) data.push({ period: p.period, value: Math.round((p.median * 100) / ci), serie: REAL });
    data.push({ period: p.period, value: p.median, serie: NOM });
  }
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 300,
    marginLeft: 52,
    marginBottom: 48,
    x: { label: null, domain: points.map((p) => p.period), tickRotate: points.length > 6 ? -40 : 0 },
    y: { label: "↑ Mediana del ingreso por persona", grid: true, tickFormat: (d: number) => fmtShort(d) },
    color: { domain: [REAL, NOM], range: [ACCENT, inkA(0.42)], legend: true },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.line(data, { x: "period", y: "value", stroke: "serie", strokeWidth: 2 }),
      Plot.dot(data, { x: "period", y: "value", fill: "serie", r: 3 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Tail zoom: income vs percentile across the top (p90 → p100), where it explodes.
// ---------------------------------------------------------------------------
export function renderTailZoom(el: HTMLElement, m: Measure, userX: number, userPct: number) {
  clear(el);
  const keys = Object.keys(m.percentiles).map(Number).filter((p) => p >= 90).sort((a, b) => a - b);
  const data = keys.map((p) => ({ pct: p, income: m.percentiles[String(p)] }));
  const topIncome = data[data.length - 1].income;
  const inRange = userPct >= 90;
  const marks: any[] = [
    Plot.areaY(data, { x: "pct", y: "income", fill: ACCENT, fillOpacity: 0.08 }),
    Plot.lineY(data, { x: "pct", y: "income", stroke: ACCENT, strokeWidth: 2 }),
    Plot.dot(data, { x: "pct", y: "income", fill: ACCENT, r: 2.5 }),
  ];
  if (inRange) {
    const ux = Math.min(99.99, userPct);
    const uy = Math.min(userX, topIncome);
    marks.push(Plot.ruleX([ux], { stroke: INK, strokeDasharray: "3,3", strokeOpacity: 0.5 }));
    marks.push(Plot.dot([{ x: ux, y: uy }], { x: "x", y: "y", r: 5, fill: ACCENT, stroke: PAPER, strokeWidth: 1.5 }));
    marks.push(Plot.text([{ x: ux, y: uy }], { x: "x", y: "y", text: () => "vos", dy: -10, dx: -4, textAnchor: "end", fill: ACCENT, fontWeight: 700, fontSize: 11 }));
  }
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 300,
    marginLeft: 56,
    marginRight: 20,
    marginBottom: 44,
    x: { label: "percentil →", domain: [90, 100], tickFormat: (d: number) => "p" + d },
    y: { label: "↑ ingreso por persona", tickFormat: (d: number) => fmtShort(d), grid: true },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "12px" },
    marks,
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Structural splits (Observable Plot small-multiples): median individual income per group,
// one panel per dimension, with the national median as a dashed reference.
// ---------------------------------------------------------------------------
export function renderSplitsPanels(el: HTMLElement, splits: Splits, nationalMedian: number) {
  const dims = Object.entries(splits);
  el.innerHTML = dims
    .map(([k, d]) => `<figure class="split-panel"><figcaption>${d.label}</figcaption><div class="split-chart" data-dim="${k}"></div></figure>`)
    .join("");
  for (const [k, d] of dims) {
    const div = el.querySelector<HTMLElement>(`.split-chart[data-dim="${k}"]`);
    if (!div) continue;
    const w = div.clientWidth || 320;
    const maxX = Math.max(nationalMedian, ...d.groups.map((g) => g.median)) * 1.2;
    const plot = Plot.plot({
      width: w,
      height: d.groups.length * 34 + 20,
      marginLeft: 132,
      marginRight: 70,
      marginTop: 6,
      marginBottom: 6,
      x: { axis: null, domain: [0, maxX] },
      y: { domain: d.groups.map((g) => g.label), label: null },
      style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
      marks: [
        Plot.barX(d.groups, { x: "median", y: "label", fill: ACCENT, fillOpacity: 0.5, inset: 1 }),
        Plot.text(d.groups, {
          x: "median", y: "label", dx: 6, textAnchor: "start", fill: MUTED, fontSize: 10,
          text: (g: { median: number }) => `${fmtShort(g.median)} · ${(g.median / nationalMedian).toLocaleString("es-AR", { maximumFractionDigits: 1 })}×`,
        }),
        Plot.ruleX([nationalMedian], { stroke: INK, strokeDasharray: "3,3", strokeOpacity: 0.4 }),
      ],
    });
    div.append(plot);
  }
}

// ---------------------------------------------------------------------------
// Steepness (Observable Plot): peso increment per percentile around the user — the
// distribution's local slope (cheap steps at the bottom, brutal near the top).
// ---------------------------------------------------------------------------
export function renderSteepness(el: HTMLElement, m: Measure, userPct: number) {
  clear(el);
  const lo = Math.max(2, Math.floor(userPct) - 8);
  const hi = Math.min(98, Math.ceil(userPct) + 8);
  const you = Math.round(Math.min(98, Math.max(2, userPct)));
  const data: { p: number; inc: number; you: boolean }[] = [];
  for (let p = lo; p <= hi; p++) {
    // centered slope: the local $/percentile step, so a single round-number mass point
    // (e.g. exactly $500.000) doesn't zero out the bar at the user's own percentile.
    const next = m.percentiles[String(p + 1)];
    const prev = m.percentiles[String(p - 1)];
    if (next == null || prev == null) continue;
    data.push({ p, inc: Math.max(0, (next - prev) / 2), you: p === you });
  }
  const plot = Plot.plot({
    width: el.clientWidth || 680,
    height: 260,
    marginLeft: 58,
    marginBottom: 40,
    x: { label: "percentil →", tickFormat: (d: number) => "p" + d },
    y: { label: "↑ $ por persona que suma cada percentil", grid: true, tickFormat: (d: number) => fmtShort(d) },
    style: { background: "transparent", color: INK, fontFamily: "inherit", fontSize: "11px" },
    marks: [
      Plot.barY(data, { x: "p", y: "inc", fill: (d: { you: boolean }) => (d.you ? ACCENT : inkA(0.14)), inset: 0.5 }),
      Plot.ruleY([0], { stroke: INK, strokeOpacity: 0.2 }),
    ],
  });
  el.append(plot);
}

// ---------------------------------------------------------------------------
// Dual rulers (custom SVG): the user's position by household per-capita (IPCF) and,
// only for one-person households, by individual salary — two different distributions.
// ---------------------------------------------------------------------------
export function renderDualRulers(el: HTMLElement, ipcf: Measure, individual: Measure, v: number, people: number) {
  const w = el.clientWidth || 680;
  const h = 172;
  const padL = 16;
  const padR = 16;
  const x = (p: number) => padL + (Math.min(100, Math.max(0, p)) / 100) * (w - padL - padR);

  const ruler = (baseY: number, title: string, m: Measure, marker: number | null) => {
    let s = `<text x="${padL}" y="${baseY - 22}" font-size="11" font-weight="600" fill="${INK}">${title}</text>`;
    s += `<line x1="${padL}" y1="${baseY}" x2="${w - padR}" y2="${baseY}" stroke="${inkA(0.25)}"/>`;
    for (const p of [10, 50, 90]) {
      const tx = x(p);
      s += `<line x1="${tx}" y1="${baseY - 4}" x2="${tx}" y2="${baseY + 4}" stroke="${inkA(0.3)}"/>`;
      s += `<text x="${tx}" y="${baseY + 17}" text-anchor="middle" font-size="10" fill="${MUTED}">p${p} · ${fmtShort(m.percentiles[String(p)])}</text>`;
    }
    if (marker != null) {
      const ux = x(marker);
      const a = ux > w - 70 ? "end" : ux < 70 ? "start" : "middle";
      s += `<line x1="${ux}" y1="${baseY - 16}" x2="${ux}" y2="${baseY}" stroke="${ACCENT}" stroke-width="2"/>`;
      s += `<circle cx="${ux}" cy="${baseY}" r="5" fill="${ACCENT}" stroke="${PAPER}" stroke-width="1.5"/>`;
      s += `<text x="${ux}" y="${baseY - 20}" text-anchor="${a}" font-size="11" font-weight="700" fill="${ACCENT}">vos · p${Math.round(Math.min(99, marker))}</text>`;
    }
    return s;
  };

  const ipcfPct = percentileOfIncome(ipcf, v);
  const indPct = people === 1 ? percentileOfIncome(individual, v) : null;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" font-family="inherit" style="display:block">`;
  s += ruler(52, "Como hogar — ingreso por persona", ipcf, ipcfPct);
  s += ruler(136, "Como persona — sueldo individual", individual, indPct);
  s += `</svg>`;
  el.innerHTML = s;
}

// ---------------------------------------------------------------------------
// Budget compare (custom SVG): household income vs typical monthly costs (stacked).
// ---------------------------------------------------------------------------
export function renderBudget(el: HTMLElement, income: number, lines: CostLine[], people: number) {
  const seg = lines.map((l) => ({ ...l, amt: l.scope === "hogar" ? l.amount : l.amount * people }));
  const total = seg.reduce((s, x) => s + x.amt, 0);
  const max = Math.max(income, total) * 1.04 || 1;
  const w = el.clientWidth || 680;
  const barH = 30;
  const x = (v: number) => Math.max(0, (v / max) * w);
  const covers = income >= total;

  let y = 0;
  let s = `<svg viewBox="0 0 ${w} 138" width="100%" height="138" font-family="inherit" style="display:block">`;
  // income bar — accent up to the gastos total, surplus (if any) painted green
  const surplus = income - total;
  s += `<text x="0" y="${y + 12}" font-size="12" fill="${INK}">Tu ingreso del hogar — <tspan font-weight="700">${fmtShort(income)}</tspan>${surplus > 0 ? ` <tspan fill="${OK}" font-weight="600">· sobran ${fmtShort(surplus)}</tspan>` : ""}</text>`;
  y += 20;
  s += `<rect x="0" y="${y}" width="${x(income)}" height="${barH}" rx="2" fill="${ACCENT}"/>`;
  if (surplus > 0) {
    const sx = x(total);
    s += `<rect x="${sx.toFixed(1)}" y="${y}" width="${(x(income) - sx).toFixed(1)}" height="${barH}" rx="2" fill="${OK}"><title>Sobra: ${fmtShort(surplus)}</title></rect>`;
  }
  y += barH + 18;
  // cost bar (stacked)
  s += `<text x="0" y="${y + 12}" font-size="12" fill="${INK}">Gastos del hogar — <tspan font-weight="700" fill="${covers ? INK : POBRE}">${fmtShort(total)}</tspan></text>`;
  y += 20;
  let xacc = 0;
  seg.forEach((g, i) => {
    const segW = x(g.amt);
    const col = accentA((0.22 + 0.06 * i).toFixed(2));
    s += `<rect x="${xacc.toFixed(1)}" y="${y}" width="${Math.max(0, segW - 1).toFixed(1)}" height="${barH}" fill="${col}"><title>${g.label}: ${fmtShort(g.amt)}</title></rect>`;
    xacc += segW;
  });
  y += barH;
  // two reference lines across both bars: where gastos end and where income reaches.
  // when there's a surplus, they bracket the green block; in a deficit they bracket the gap.
  // labels sit at top (income) vs bottom (gastos) so they never collide when the gap is thin.
  const refLine = (lx: number, label: string, atTop: boolean) => {
    const anchor = lx > w - 56 ? "end" : "start";
    const tx = lx + (anchor === "end" ? -4 : 4);
    return (
      `<line x1="${lx.toFixed(1)}" y1="14" x2="${lx.toFixed(1)}" y2="${y}" stroke="${INK}" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="4,3"/>` +
      `<text x="${tx.toFixed(1)}" y="${atTop ? 11 : y + 12}" text-anchor="${anchor}" font-size="9" fill="${INK}" fill-opacity="0.62">${label}</text>`
    );
  };
  s += refLine(x(total), "gastos", false);
  s += refLine(x(income), "tu ingreso", true);
  s += `</svg>`;
  el.innerHTML = s;
}

import { describe, it, expect, beforeAll, vi } from "vitest";
import * as charts from "../src/charts";
import { ARTIFACT, clone, mountEl } from "./fixture";

// Shorthands for the real artifact pieces the charts consume.
const IPCF = ARTIFACT.measures.ipcf;
const IND = ARTIFACT.measures.individual;
const CBA = ARTIFACT.poverty_lines.cba_adulto_equiv;
const CBT = ARTIFACT.poverty_lines.cbt_adulto_equiv;
const HIST = ARTIFACT.history;

/**
 * A detached <div> whose clientWidth stays 0 (falsy) — jsdom does no layout, so this
 * exercises the `el.clientWidth || <fallback>` branch that mountEl()'s non-zero width skips.
 */
function zeroEl(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const hasSvg = (el: HTMLElement) => expect(el.querySelector("svg")).not.toBeNull();

// Income classes engineered to hit every band branch in renderClassScale:
//  - "cero":  lo == hi  -> segW ≈ 0  -> `if (segW <= 0.5) continue`
//  - "angosta": ~5 pct points -> 0.5 < segW <= 58 -> rect drawn, NO label (segW > 58 false)
//  - "baja"/"alta": wide -> segW > 58 -> rect + label; "alta" also has hi === Infinity
const CLASSES = [
  { key: "baja", name: "Baja", short: "Baja", desc: "", phrase: "", lo: 0, hi: 200000, color: "#cccccc" },
  { key: "cero", name: "Cero", short: "C", desc: "", phrase: "", lo: 450000, hi: 450000, color: "#dddddd" },
  { key: "angosta", name: "Angosta", short: "Ang", desc: "", phrase: "", lo: 450000, hi: 500000, color: "#bbbbbb" },
  { key: "alta", name: "Alta", short: "Alta", desc: "", phrase: "", lo: 1000000, hi: Infinity, color: "#999999" },
] as any;

beforeAll(() => charts.refreshPalette());

// ---------------------------------------------------------------------------
describe("percentileMargin", () => {
  it("returns a positive finite margin for a normal percentile", () => {
    const m = charts.percentileMargin(IPCF, 50);
    expect(m).toBeGreaterThan(0);
    expect(Number.isFinite(m)).toBe(true);
  });

  it("clamps pct to [0.1, 99.9]", () => {
    expect(charts.percentileMargin(IPCF, -5)).toBeCloseTo(charts.percentileMargin(IPCF, 0.05));
    expect(charts.percentileMargin(IPCF, 150)).toBeCloseTo(charts.percentileMargin(IPCF, 99.95));
  });

  it("uses max(1, n/2) for a tiny unweighted n", () => {
    const a = clone();
    a.measures.ipcf.n_unweighted = 1;
    const tiny = charts.percentileMargin(a.measures.ipcf, 50);
    expect(Number.isFinite(tiny)).toBe(true);
    expect(tiny).toBeGreaterThan(charts.percentileMargin(IPCF, 50));
  });
});

// ---------------------------------------------------------------------------
describe("refreshPalette", () => {
  it("falls back to defaults when CSS vars are empty (v falsy)", () => {
    expect(() => charts.refreshPalette()).not.toThrow();
  });

  it("reads a CSS custom property when present (v truthy)", () => {
    document.documentElement.style.setProperty("--ink", "#1A1A1A");
    expect(() => charts.refreshPalette()).not.toThrow();
    document.documentElement.style.removeProperty("--ink");
  });

  it("returns the fallback when document is undefined", () => {
    try {
      vi.stubGlobal("document", undefined);
      expect(() => charts.refreshPalette()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
    charts.refreshPalette();
  });
});

// ---------------------------------------------------------------------------
describe("renderRuler", () => {
  it.each([2, 50, 99])("renders the ruler (anchor) for pct=%s", (pct: number) => {
    const el = mountEl();
    charts.renderRuler(el, IPCF, pct);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
    expect(el.innerHTML).toContain("media");
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderRuler(el, IPCF, 50);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderClassScale", () => {
  it.each([10000, 450000, 2500000])("renders bands + user marker for v=%s", (v: number) => {
    const el = mountEl();
    charts.renderClassScale(el, IPCF, CLASSES, v);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
    // 3 rects: baja + angosta + alta (cero is skipped by the segW<=0.5 branch)
    expect(el.querySelectorAll("rect").length).toBe(3);
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderClassScale(el, IPCF, CLASSES, 450000);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderNumberLine", () => {
  it("renders middle anchors for a mid-scale income", () => {
    const el = mountEl();
    charts.renderNumberLine(el, 450000, CBA, CBT);
    hasSvg(el);
    expect(el.innerHTML).toContain("indigencia");
    expect(el.innerHTML).toContain("pobreza");
    expect(el.innerHTML).toContain("vos");
  });

  it("marks income off-scale (end anchor)", () => {
    const el = mountEl();
    charts.renderNumberLine(el, 2_000_000, CBA, CBT);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("uses the start anchor for a very low income", () => {
    const el = mountEl();
    charts.renderNumberLine(el, 30000, CBA, CBT);
    hasSvg(el);
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderNumberLine(el, 450000, CBA, CBT);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderShareBar", () => {
  it.each([1, 5])("marks the user's decile %s", (ud: number) => {
    const el = mountEl();
    charts.renderShareBar(el, IPCF, ud);
    hasSvg(el);
    expect(el.querySelectorAll("rect").length).toBe(10);
    expect(el.innerHTML).toContain("tu decil");
  });

  it("draws no marker for a non-matching decile (0)", () => {
    const el = mountEl();
    charts.renderShareBar(el, IPCF, 0);
    hasSvg(el);
    expect(el.innerHTML).not.toContain("tu decil");
  });

  it("uses the end anchor for a thin far-right user decile", () => {
    const a = clone();
    a.measures.ipcf.deciles.forEach((d, i) => {
      d.share = i < 9 ? 10.9 : 1.9;
    });
    const el = mountEl();
    charts.renderShareBar(el, a.measures.ipcf, 10);
    hasSvg(el);
    expect(el.innerHTML).toContain("tu decil");
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderShareBar(el, IPCF, 5);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderDecileBars", () => {
  it("renders decile bars with the user's decile highlighted", () => {
    const el = mountEl();
    charts.renderDecileBars(el, IPCF, 7);
    hasSvg(el);
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderDecileBars(el, IPCF, 7);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderCDF", () => {
  it("renders an in-range user marker (cap truthy, not near edge)", () => {
    const el = mountEl();
    charts.renderCDF(el, IPCF, 450000, 50);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("extends the domain and uses the near-edge anchor for an extreme income", () => {
    const el = mountEl();
    charts.renderCDF(el, IPCF, 20_000_000, 99.99);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("falls back to the last percentile income when cap is 0", () => {
    const a = clone();
    a.measures.ipcf.cap = 0;
    const el = mountEl();
    charts.renderCDF(el, a.measures.ipcf, 450000, 50);
    hasSvg(el);
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderCDF(el, IPCF, 450000, 50);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderHistogram", () => {
  it("flags the bin the user falls in (middle bin)", () => {
    const el = mountEl();
    charts.renderHistogram(el, IPCF, 300000);
    hasSvg(el);
    expect(el.innerHTML).toContain("mediana");
    expect(el.querySelectorAll("rect").length).toBeGreaterThan(0);
  });

  it("flags the last bin when the user is at/after the last edge", () => {
    const el = mountEl();
    charts.renderHistogram(el, IPCF, 6_000_000);
    hasSvg(el);
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderHistogram(el, IPCF, 300000);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderLorenz", () => {
  it("renders the Lorenz curve with the equality line", () => {
    const el = mountEl();
    charts.renderLorenz(el, IPCF);
    hasSvg(el);
    expect(el.innerHTML).toContain("igualdad");
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderLorenz(el, IPCF);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderRegions", () => {
  it("renders with most regions below the user (off=false)", () => {
    const el = mountEl();
    charts.renderRegions(el, ARTIFACT.regions, 100000);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("renders the off-scale marker (off=true) for a huge income", () => {
    const el = mountEl();
    charts.renderRegions(el, ARTIFACT.regions, 5_000_000);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderRegions(el, ARTIFACT.regions, 100000);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderAglomerados", () => {
  it("renders with off=false for a small income", () => {
    const el = mountEl();
    charts.renderAglomerados(el, ARTIFACT.aglomerados, 100000);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("renders the off-scale marker (off=true) for a huge income", () => {
    const el = mountEl();
    charts.renderAglomerados(el, ARTIFACT.aglomerados, 5_000_000);
    hasSvg(el);
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderAglomerados(el, ARTIFACT.aglomerados, 100000);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderTrendRealVsSmvm", () => {
  it("renders the real median vs minimum-wage lines", () => {
    const el = mountEl();
    charts.renderTrendRealVsSmvm(el, HIST.median_ipcf_quarterly, HIST.smvm_quarterly, HIST.cpi_quarterly);
    hasSvg(el);
    expect(el.innerHTML).toContain("Mediana");
  });

  it("returns early for an empty median series", () => {
    const el = mountEl();
    charts.renderTrendRealVsSmvm(el, [], HIST.smvm_quarterly, HIST.cpi_quarterly);
    expect(el.querySelector("svg")).toBeNull();
  });

  it("skips periods missing from cpi (continue) and from smvm (no SMV push)", () => {
    const el = zeroEl();
    const median = [
      { period: "2024-T1", median: 100000 },
      { period: "2024-T2", median: 120000 }, // in cpi, NOT in smvm -> if (s) false
      { period: "2099-Z9", median: 130000 }, // NOT in cpi -> continue
    ] as any;
    const cpi = [
      { period: "2024-T1", index: 50 },
      { period: "2024-T2", index: 55 },
    ] as any;
    const smvm = [{ period: "2024-T1", smvm: 60000 }] as any;
    charts.renderTrendRealVsSmvm(el, median, smvm, cpi);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderCanastas", () => {
  it("renders canastas-per-decile bars", () => {
    const el = mountEl();
    charts.renderCanastas(el, IPCF.deciles, CBT, 5);
    hasSvg(el);
    expect(el.innerHTML).toContain("pobreza");
  });

  it("falls back to the default width", () => {
    const el = zeroEl();
    charts.renderCanastas(el, IPCF.deciles, CBT, 5);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderTrendGini", () => {
  it("renders a >6-point series (rotated ticks)", () => {
    const el = mountEl();
    charts.renderTrendGini(el, HIST.gini_quarterly);
    hasSvg(el);
  });

  it("renders a <=6-point series (no rotation)", () => {
    const el = zeroEl();
    charts.renderTrendGini(el, HIST.gini_quarterly.slice(0, 4));
    hasSvg(el);
  });

  it("returns early for an empty series", () => {
    const el = mountEl();
    charts.renderTrendGini(el, []);
    expect(el.querySelector("svg")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("renderTrendPoverty", () => {
  it("renders a >6-point series (rotated ticks)", () => {
    const el = mountEl();
    charts.renderTrendPoverty(el, HIST.poverty_semestral);
    hasSvg(el);
  });

  it("renders a <=6-point series (no rotation)", () => {
    const el = zeroEl();
    charts.renderTrendPoverty(el, HIST.poverty_semestral.slice(0, 4));
    hasSvg(el);
  });

  it("returns early for an empty series", () => {
    const el = mountEl();
    charts.renderTrendPoverty(el, []);
    expect(el.querySelector("svg")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("renderTrendMedian", () => {
  it("renders nominal + real lines for the full series", () => {
    const el = mountEl();
    charts.renderTrendMedian(el, HIST.median_ipcf_quarterly, HIST.cpi_quarterly);
    hasSvg(el);
    expect(el.innerHTML).toContain("pesos");
  });

  it("skips the REAL series for a period missing from cpi (<=6 ticks)", () => {
    const el = zeroEl();
    const points = [
      { period: "2024-T1", median: 100000 },
      { period: "ZZZ", median: 200000 }, // not in cpi -> if (ci) false, only NOM pushed
    ] as any;
    const cpi = [{ period: "2024-T1", index: 50 }] as any;
    charts.renderTrendMedian(el, points, cpi);
    hasSvg(el);
  });

  it("returns early for an empty series", () => {
    const el = mountEl();
    charts.renderTrendMedian(el, [], HIST.cpi_quarterly);
    expect(el.querySelector("svg")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("renderTailZoom", () => {
  it("marks the user when in range (clamped to the top income)", () => {
    const el = mountEl();
    charts.renderTailZoom(el, IPCF, 20_000_000, 95);
    hasSvg(el);
    expect(el.innerHTML).toContain("vos");
  });

  it("omits the marker when the user is below p90 (and falls back to default width)", () => {
    const el = zeroEl();
    charts.renderTailZoom(el, IPCF, 450000, 50);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderSplitsPanels", () => {
  it("renders one Plot per split dimension", () => {
    const el = mountEl();
    charts.renderSplitsPanels(el, ARTIFACT.splits, IND.median);
    expect(el.innerHTML).toContain("split-panel");
    expect(el.querySelectorAll(".split-chart svg").length).toBeGreaterThan(0);
  });

  it("uses div.clientWidth when it is non-zero", () => {
    const el = mountEl();
    const wideDiv = document.createElement("div");
    Object.defineProperty(wideDiv, "clientWidth", { value: 400 });
    (el as any).querySelector = () => wideDiv;
    charts.renderSplitsPanels(el, ARTIFACT.splits, IND.median);
    expect(wideDiv.querySelector("svg")).not.toBeNull();
  });

  it("skips a dimension when its chart div is missing (!div)", () => {
    const el = mountEl();
    (el as any).querySelector = () => null;
    charts.renderSplitsPanels(el, ARTIFACT.splits, IND.median);
    expect(el.innerHTML).toContain("split-panel"); // markup set before the query loop
    expect(el.innerHTML).not.toContain("<svg"); // nothing appended
  });
});

// ---------------------------------------------------------------------------
describe("renderSteepness", () => {
  it("renders the slope window and skips missing neighbours (continue)", () => {
    const a = clone();
    delete (a.measures.ipcf.percentiles as any)["50"]; // p49 -> next null, p51 -> prev null
    const el = mountEl();
    charts.renderSteepness(el, a.measures.ipcf, 50);
    hasSvg(el);
  });

  it("clamps the window at the low edge (userPct≈2)", () => {
    const el = mountEl();
    charts.renderSteepness(el, IPCF, 2);
    hasSvg(el);
  });

  it("clamps the window at the high edge (userPct≈98) and falls back to default width", () => {
    const el = zeroEl();
    charts.renderSteepness(el, IPCF, 98);
    hasSvg(el);
  });
});

// ---------------------------------------------------------------------------
describe("renderDualRulers", () => {
  it("marks both rulers for a one-person household (middle anchor)", () => {
    const el = mountEl();
    charts.renderDualRulers(el, IPCF, IND, 450000, 1);
    hasSvg(el);
    expect(el.innerHTML).toContain("Como hogar");
    expect(el.innerHTML).toContain("Como persona");
    expect(el.innerHTML).toContain("vos");
  });

  it("uses the end anchor for a high income", () => {
    const el = mountEl();
    charts.renderDualRulers(el, IPCF, IND, 2_500_000, 1);
    hasSvg(el);
  });

  it("uses the start anchor for a low income", () => {
    const el = mountEl();
    charts.renderDualRulers(el, IPCF, IND, 50000, 1);
    hasSvg(el);
  });

  it("leaves the individual ruler unmarked for multi-person households", () => {
    const el = zeroEl();
    charts.renderDualRulers(el, IPCF, IND, 450000, 2);
    hasSvg(el);
    expect(el.innerHTML).toContain("Como persona");
  });
});

// ---------------------------------------------------------------------------
describe("renderBudget", () => {
  const HOGAR_LINES = ARTIFACT.cost_of_living.lines;

  it("paints a surplus when income is above the total", () => {
    const el = mountEl();
    charts.renderBudget(el, 2_000_000, HOGAR_LINES, 1);
    hasSvg(el);
    expect(el.innerHTML).toContain("sobran");
    expect(el.innerHTML).toContain("gastos");
    expect(el.innerHTML).toContain("tu ingreso");
  });

  it("shows a deficit when income is below the total", () => {
    const el = zeroEl();
    charts.renderBudget(el, 1_000_000, HOGAR_LINES, 1);
    hasSvg(el);
    expect(el.innerHTML).not.toContain("sobran");
  });

  it("multiplies persona-scope lines by household size", () => {
    const lines = [
      { key: "renta", label: "Renta", amount: 100000, scope: "persona", detail: "", source: "", confidence: "x" },
      { key: "luz", label: "Luz", amount: 50000, scope: "hogar", detail: "", source: "", confidence: "x" },
    ] as any;
    const el = mountEl();
    charts.renderBudget(el, 400000, lines, 3);
    hasSvg(el);
  });

  it("uses max=1 when income and total are both 0", () => {
    const el = mountEl();
    charts.renderBudget(el, 0, [], 1);
    hasSvg(el);
  });
});

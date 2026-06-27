import type { Measure } from "./types";

/** Percentile (0–100) of an income within a measure, by interpolating the p1..p99 lookup. */
export function percentileOfIncome(measure: Measure, x: number): number {
  if (x <= 0) return 0;
  // Use every percentile point available, including the finer upper tail (99.5 / 99.9 / 99.99).
  const ps = Object.keys(measure.percentiles).map(Number).sort((a, b) => a - b);
  const vs = ps.map((p) => measure.percentiles[String(p)]);
  const last = ps.length - 1;
  if (x <= vs[0]) return Math.max(0.1, (x / vs[0]) * ps[0]);
  if (x >= vs[last]) return Math.min(99.99, ps[last]);
  // x is strictly inside (vs[0], vs[last]), so a containing bracket [vs[i], vs[i+1]) is guaranteed
  // to exist — advance to it, then interpolate the percentile within it.
  let i = 0;
  while (!(x >= vs[i] && x < vs[i + 1])) i++;
  const frac = (x - vs[i]) / (vs[i + 1] - vs[i]);
  return Math.round((ps[i] + frac * (ps[i + 1] - ps[i])) * 100) / 100;
}

export function decileOf(percentile: number): number {
  return Math.min(10, Math.max(1, Math.ceil(percentile / 10)));
}

import { describe, expect, it } from "vitest";
import { decileOf, percentileOfIncome } from "../src/stats";
import type { Measure } from "../src/types";

// percentileOfIncome only reads `.percentiles`, so a partial cast is enough.
const m = (percentiles: Record<string, number>) => ({ percentiles }) as unknown as Measure;
const M = m({ "1": 100, "50": 500, "99": 2000, "99.9": 5000 });

describe("percentileOfIncome", () => {
  it("returns 0 for non-positive income", () => {
    expect(percentileOfIncome(M, 0)).toBe(0);
    expect(percentileOfIncome(M, -100)).toBe(0);
  });

  it("interpolates linearly from 0 below the first percentile", () => {
    expect(percentileOfIncome(M, 50)).toBeCloseTo(0.5, 5); // (50/100)*p1
    expect(percentileOfIncome(M, 100)).toBeCloseTo(1, 5); // exactly p1
  });

  it("floors the bottom tail at 0.1 so it never reads as p0", () => {
    expect(percentileOfIncome(M, 1)).toBe(0.1); // (1/100)*1 = 0.01 -> max(0.1, …)
  });

  it("saturates at the top percentile when income exceeds the grid", () => {
    expect(percentileOfIncome(M, 6000)).toBe(99.9); // min(99.99, last p)
  });

  it("interpolates within the first bracket (loop matches immediately)", () => {
    // x=300 sits in [p1=100, p50=500): frac=0.5 -> 1 + 0.5*49 = 25.5
    expect(percentileOfIncome(M, 300)).toBeCloseTo(25.5, 2);
  });

  it("interpolates within an interior bracket (advances past earlier brackets)", () => {
    // x=1000 sits in [p50=500, p99=2000): frac=1/3 -> 50 + (1/3)*49 ≈ 66.33
    expect(percentileOfIncome(M, 1000)).toBeCloseTo(66.33, 2);
  });

  it("clamps the saturated value to 99.99 when the grid reaches that high", () => {
    const hi = m({ "1": 100, "99.99": 1000 });
    expect(percentileOfIncome(hi, 5000)).toBe(99.99);
  });
});

describe("decileOf", () => {
  it("maps percentiles into deciles 1..10", () => {
    expect(decileOf(0)).toBe(1);
    expect(decileOf(5)).toBe(1);
    expect(decileOf(15)).toBe(2);
    expect(decileOf(100)).toBe(10);
  });
  it("clamps above 100 to decile 10", () => {
    expect(decileOf(150)).toBe(10);
  });
});

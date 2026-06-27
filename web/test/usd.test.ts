import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBlue } from "../src/usd";

function mockFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBlue", () => {
  it("returns the venta rate and date on a valid response", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ venta: 1450, fechaActualizacion: "2026-06-26" }) }));
    expect(await fetchBlue()).toEqual({ venta: 1450, fecha: "2026-06-26" });
  });

  it("defaults the date to empty string when the field is missing", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ venta: 1450 }) }));
    expect(await fetchBlue()).toEqual({ venta: 1450, fecha: "" });
  });

  it("returns null on a non-ok HTTP response", async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({ venta: 1450 }) }));
    expect(await fetchBlue()).toBeNull();
  });

  it("returns null when venta is not a number", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ venta: "1450" }) }));
    expect(await fetchBlue()).toBeNull();
  });

  it("returns null when venta is not positive", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ venta: 0 }) }));
    expect(await fetchBlue()).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockFetch(async () => {
      throw new Error("network down");
    });
    expect(await fetchBlue()).toBeNull();
  });
});

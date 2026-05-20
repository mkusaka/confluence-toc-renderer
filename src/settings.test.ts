import { describe, expect, it } from "vitest";
import { DEFAULT_RENDER_OPTIONS, normalizeRenderOptions } from "./settings";

describe("normalizeRenderOptions", () => {
  it("returns defaults for empty input", () => {
    expect(normalizeRenderOptions()).toEqual(DEFAULT_RENDER_OPTIONS);
  });

  it("clamps heading levels and preserves supported values", () => {
    expect(
      normalizeRenderOptions({
        maxLevel: 9,
        minLevel: 0,
        outline: true,
        type: "flat",
      }),
    ).toEqual({
      maxLevel: 6,
      minLevel: 1,
      outline: true,
      type: "flat",
    });
  });

  it("orders reversed heading levels", () => {
    expect(
      normalizeRenderOptions({
        maxLevel: "2",
        minLevel: "5",
      }),
    ).toMatchObject({
      maxLevel: 5,
      minLevel: 2,
    });
  });

  it("falls back to list for unsupported structure values", () => {
    expect(
      normalizeRenderOptions({
        type: "grid",
      }),
    ).toMatchObject({
      type: "list",
    });
  });
});

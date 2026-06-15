/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { describe, expect, it } from "vitest";

import { isNewer } from "./update";

describe("isNewer", () => {
  it("detects a higher version", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.1.1", "0.1.0")).toBe(true);
  });

  it("is false for equal or older versions", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("0.9.9", "1.0.0")).toBe(false);
  });

  it("ignores a leading v on either side", () => {
    expect(isNewer("v0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("v0.1.0", "v0.1.0")).toBe(false);
  });

  it("treats missing trailing components as zero", () => {
    expect(isNewer("0.1", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.1")).toBe(false);
    expect(isNewer("0.2", "0.1.9")).toBe(true);
  });

  it("compares numerically, not lexically", () => {
    expect(isNewer("0.10.0", "0.9.0")).toBe(true);
    expect(isNewer("0.9.0", "0.10.0")).toBe(false);
  });

  it("drops a pre-release suffix when comparing", () => {
    expect(isNewer("0.2.0-beta.1", "0.1.0")).toBe(true);
    // The suffix is ignored, so 0.2.0-beta.1 reads as 0.2.0 (equal, not newer).
    expect(isNewer("0.2.0-beta.1", "0.2.0")).toBe(false);
  });
});

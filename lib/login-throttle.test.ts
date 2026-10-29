import { describe, expect, it } from "vitest";

import {
  ATTEMPT_WINDOW_MINUTES,
  MAX_ATTEMPTS,
  addressKey,
  clientAddress,
  isLockedOut,
  windowStart,
} from "./login-throttle";

describe("clientAddress", () => {
  it("takes the client, which is the first entry in the chain", () => {
    expect(clientAddress("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe(
      "203.0.113.7",
    );
  });

  it("copes with a single address and stray spacing", () => {
    expect(clientAddress("  203.0.113.7  ")).toBe("203.0.113.7");
  });

  it("falls back to one bucket when there is no header", () => {
    // Local development has no proxy. Everyone sharing a bucket is the safe
    // way round: it throttles more, never less.
    expect(clientAddress(null)).toBe("unknown");
    expect(clientAddress("")).toBe("unknown");
  });
});

describe("addressKey", () => {
  it("is stable for the same address and secret", () => {
    expect(addressKey("203.0.113.7", "secret")).toBe(
      addressKey("203.0.113.7", "secret"),
    );
  });

  it("separates different addresses", () => {
    expect(addressKey("203.0.113.7", "secret")).not.toBe(
      addressKey("203.0.113.8", "secret"),
    );
  });

  it("changes with the secret, so the hashes are not a public rainbow table", () => {
    expect(addressKey("203.0.113.7", "one")).not.toBe(
      addressKey("203.0.113.7", "two"),
    );
  });

  it("never keeps the address itself", () => {
    expect(addressKey("203.0.113.7", "secret")).not.toContain("203.0.113.7");
  });
});

describe("isLockedOut", () => {
  it("allows up to the limit and then stops", () => {
    expect(isLockedOut(MAX_ATTEMPTS - 1)).toBe(false);
    expect(isLockedOut(MAX_ATTEMPTS)).toBe(true);
    expect(isLockedOut(MAX_ATTEMPTS + 1)).toBe(true);
  });

  it("starts clean", () => {
    expect(isLockedOut(0)).toBe(false);
  });
});

describe("windowStart", () => {
  it("looks back exactly the window", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    expect(windowStart(now).toISOString()).toBe(
      new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString(),
    );
  });
});

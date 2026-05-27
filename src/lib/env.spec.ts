import { describe, expect, it } from "vitest";

import { parsePositiveNumber } from "./env";

const FALLBACK = 30_000;

describe("parsePositiveNumber", () => {
    it("returns the fallback when the value is absent (bug: undefined env crashes Number())", () => {
        expect(parsePositiveNumber(undefined, FALLBACK)).toBe(FALLBACK);
    });

    it("returns the fallback when the value is not numeric (bug: 'abc' would become NaN ttl)", () => {
        expect(parsePositiveNumber("abc", FALLBACK)).toBe(FALLBACK);
    });

    it("returns the fallback when the value is negative (bug: negative ttl always serves stale)", () => {
        expect(parsePositiveNumber("-100", FALLBACK)).toBe(FALLBACK);
    });

    it("returns the fallback when the value is zero (bug: 0ms ttl disables caching silently)", () => {
        expect(parsePositiveNumber("0", FALLBACK)).toBe(FALLBACK);
    });

    it("returns the parsed value when it is a valid positive number", () => {
        expect(parsePositiveNumber("5000", FALLBACK)).toBe(5000);
    });

    it("trims-free: rejects a value with trailing junk that Number() cannot parse", () => {
        expect(parsePositiveNumber("5000ms", FALLBACK)).toBe(FALLBACK);
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchNproPriceData, getNproVolume24hUsd } from "./pricing";

const NPRO_TOKEN = "npro.nearmobile.near";

interface RheaPriceMap {
    [token: string]: { price: string; symbol: string; decimal: number };
}

/** Route fetch by URL to a canned CoinGecko or Rhea response. */
function stubFetch({ nearUsd, rhea }: { nearUsd: number; rhea: RheaPriceMap }): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            if (url.includes("coingecko")) {
                return { ok: true, json: async () => ({ near: { usd: nearUsd } }) } as Response;
            }
            if (url.includes("rhea")) {
                return { ok: true, json: async () => rhea } as Response;
            }
            throw new Error(`unexpected fetch url: ${url}`);
        }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchNproPriceData", () => {
    it("parses the NPRO USD price and derives price_near as nproUsd / nearUsd", async () => {
        stubFetch({
            nearUsd: 5,
            rhea: {
                [NPRO_TOKEN]: { price: "0.25", symbol: "NPRO", decimal: 24 },
                "wrap.near": { price: "5", symbol: "wNEAR", decimal: 24 },
            },
        });

        const data = await fetchNproPriceData();

        expect(data.price_usd).toBe(0.25);
        expect(data.near_usd).toBe(5);
        // Bug this catches: a wrong NPRO/NEAR ratio (0.25 / 5 = 0.05), e.g. inverting the division.
        expect(data.price_near).toBeCloseTo(0.05, 10);
    });

    it("returns null prices but a valid near_usd when NPRO is absent from Rhea", async () => {
        stubFetch({
            nearUsd: 4,
            rhea: {
                "wrap.near": { price: "4", symbol: "wNEAR", decimal: 24 },
            },
        });

        const data = await fetchNproPriceData();

        // Bug this catches: throwing (or returning a bogus 0 price) when NPRO is not listed yet.
        expect(data.price_usd).toBeNull();
        expect(data.price_near).toBeNull();
        expect(data.near_usd).toBe(4);
    });

    it("returns null NPRO prices when the listed price is zero or non-numeric", async () => {
        stubFetch({
            nearUsd: 3,
            rhea: {
                [NPRO_TOKEN]: { price: "0", symbol: "NPRO", decimal: 24 },
                "wrap.near": { price: "3", symbol: "wNEAR", decimal: 24 },
            },
        });

        const data = await fetchNproPriceData();

        // Bug this catches: trusting a 0/garbage upstream price and reporting it as a real quote.
        expect(data.price_usd).toBeNull();
        expect(data.near_usd).toBe(3);
    });
});

describe("getNproVolume24hUsd", () => {
    it("returns null by design (volume is computed by CG/CMC, not this service)", async () => {
        await expect(getNproVolume24hUsd()).resolves.toBeNull();
    });
});

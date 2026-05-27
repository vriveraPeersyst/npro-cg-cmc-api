import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cached } from "./cache";

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("cached", () => {
    it("serves a fresh HIT from cache within TTL without calling the fetcher again", async () => {
        const fetcher = vi.fn().mockResolvedValue("value-1");

        const first = await cached({ key: "fresh-hit", ttlMs: 1000, fetcher });
        vi.advanceTimersByTime(500); // still inside the 1000ms TTL
        const second = await cached({ key: "fresh-hit", ttlMs: 1000, fetcher });

        expect(first).toBe("value-1");
        expect(second).toBe("value-1");
        // Bug this catches: re-fetching while the entry is still fresh (wasted upstream calls).
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("re-fetches once the TTL has expired", async () => {
        const fetcher = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");

        const first = await cached({ key: "expiry", ttlMs: 1000, fetcher });
        vi.advanceTimersByTime(1001); // past the TTL
        const second = await cached({ key: "expiry", ttlMs: 1000, fetcher });

        expect(first).toBe("v1");
        expect(second).toBe("v2");
        // Bug this catches: a stale entry never expiring (serving outdated data forever).
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("returns the last known-good value when a refetch fails (stale-if-error)", async () => {
        const fetcher = vi.fn().mockResolvedValueOnce("good").mockRejectedValueOnce(new Error("upstream down"));

        const first = await cached({ key: "stale-if-error", ttlMs: 1000, fetcher });
        vi.advanceTimersByTime(1001); // force a refetch that will reject
        const second = await cached({ key: "stale-if-error", ttlMs: 1000, fetcher });

        expect(first).toBe("good");
        // Bug this catches: an upstream blip propagating a 500 to clients instead of serving stale.
        expect(second).toBe("good");
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("re-throws when the fetcher fails and there is no cached value", async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error("cold failure"));

        // Bug this catches: swallowing the error and returning undefined on a cold cache miss.
        await expect(cached({ key: "no-stale", ttlMs: 1000, fetcher })).rejects.toThrow("cold failure");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("de-duplicates concurrent calls for the same key into a single fetch", async () => {
        let resolveFetch: (value: string) => void = () => {};
        const fetcher = vi.fn().mockImplementation(
            () =>
                new Promise<string>((resolve) => {
                    resolveFetch = resolve;
                }),
        );

        // Two calls before the first settles -> they must share one in-flight promise.
        const a = cached({ key: "dedup", ttlMs: 1000, fetcher });
        const b = cached({ key: "dedup", ttlMs: 1000, fetcher });

        resolveFetch("shared");

        expect(await a).toBe("shared");
        expect(await b).toBe("shared");
        // Bug this catches: a request burst on a cold key fanning out N calls to the RPC.
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});

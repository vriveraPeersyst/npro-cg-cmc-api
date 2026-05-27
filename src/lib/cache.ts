import { logger } from "./logger";

/**
 * In-memory TTL cache with stale-if-error fallback and in-flight de-duplication.
 *
 * This is the central speed + reliability primitive for the Railway migration: with no
 * CDN in front of the app, the server itself must absorb load and survive upstream
 * outages. It has real callers in near.ts (supplies) and pricing.ts (price), and the
 * briefing's explicit goal is "alta fiabilidad" — so the abstraction is justified
 * (senior-judgment: an abstraction earns its place with >=2 real callers + a clear need).
 *
 * Behaviour (exact):
 *  - Fresh HIT: an entry exists and `now - timestamp < ttlMs` -> return it, fetcher NOT called.
 *  - Miss / expired: call `fetcher()`.
 *      - success -> store `{ value, now }` and return the fresh value.
 *      - error with a previous (stale) value present -> log a warning and return the stale value
 *        (reliability: keep serving the last known-good value through upstream blips).
 *      - error with no previous value -> re-throw (nothing safe to serve).
 *  - In-flight de-duplication: concurrent calls for the same key await the SAME promise, so a
 *    burst of requests triggers a single upstream call (no thundering herd against the RPC).
 *    The in-flight entry is cleared once it settles, success or failure.
 */

interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

interface CachedOptions<T> {
    key: string;
    ttlMs: number;
    fetcher: () => Promise<T>;
}

export async function cached<T>({ key, ttlMs, fetcher }: CachedOptions<T>): Promise<T> {
    // Cast: the shared maps are heterogeneous (one store serves many keys, each with its own T).
    // The per-key T is guaranteed by the caller passing a matching fetcher, but unprovable to TS.
    const existing = store.get(key) as CacheEntry<T> | undefined;
    if (existing !== undefined && Date.now() - existing.timestamp < ttlMs) {
        return existing.value;
    }

    const ongoing = inFlight.get(key) as Promise<T> | undefined;
    if (ongoing !== undefined) {
        return ongoing;
    }

    const request = revalidate(key, fetcher, existing);
    inFlight.set(key, request);

    try {
        return await request;
    } finally {
        inFlight.delete(key);
    }
}

async function revalidate<T>(key: string, fetcher: () => Promise<T>, stale: CacheEntry<T> | undefined): Promise<T> {
    try {
        const value = await fetcher();
        store.set(key, { value, timestamp: Date.now() });
        return value;
    } catch (err) {
        if (stale !== undefined) {
            logger.warn({ err, key }, "serving stale cache");
            return stale.value;
        }
        throw err;
    }
}

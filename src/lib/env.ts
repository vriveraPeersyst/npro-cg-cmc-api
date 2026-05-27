/**
 * Centralized, typed configuration.
 *
 * This is the ONLY module allowed to read `process.env`; the rest of the codebase
 * imports `env` (nextjs-judgment "Cuando vas a leer process.env.X -> encapsula en lib/env.ts").
 *
 * No Zod here: every variable is optional with a safe default, so there is nothing
 * that can fail at boot and gate startup. Adding a schema/dep would be cost without
 * benefit (senior-judgment "no añadas dep sin necesidad"). Defaults use `??`, not `||`.
 */

const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_SUPPLY_CACHE_TTL_MS = 30_000;
const DEFAULT_PRICE_CACHE_TTL_MS = 60_000;

/**
 * Parse an env string as a strictly positive number, falling back to `fallback`
 * when the value is absent, non-numeric, or not > 0. Exported for unit testing.
 */
export function parsePositiveNumber(raw: string | undefined, fallback: number): number {
    if (raw === undefined) {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

interface Env {
    /** Override NEAR RPC URL. `null` when unset -> the RPC manager uses its built-in list. */
    nearRpcUrl: string | null;
    /** pino log level. */
    logLevel: string;
    isProduction: boolean;
    /** TTL for the on-chain supply cache, in milliseconds. */
    supplyCacheTtlMs: number;
    /** TTL for the price cache, in milliseconds. */
    priceCacheTtlMs: number;
}

/**
 * Resolved once at module load. Frozen so consumers cannot mutate shared config.
 */
export const env: Readonly<Env> = Object.freeze({
    nearRpcUrl: process.env.NEAR_RPC_URL ?? null,
    logLevel: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
    isProduction: process.env.NODE_ENV === "production",
    supplyCacheTtlMs: parsePositiveNumber(process.env.SUPPLY_CACHE_TTL_MS, DEFAULT_SUPPLY_CACHE_TTL_MS),
    priceCacheTtlMs: parsePositiveNumber(process.env.PRICE_CACHE_TTL_MS, DEFAULT_PRICE_CACHE_TTL_MS),
} as const);

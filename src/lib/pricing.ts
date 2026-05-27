/**
 * Pricing Module
 * Fetches NPRO price data from Rhea Finance and CoinGecko
 */

import { cached } from "./cache";
import { env } from "./env";
import { logger } from "./logger";

// ============================================================================
// CONFIGURATION
// ============================================================================

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";
const RHEA_FINANCE_API_URL = "https://api.rhea.finance";

// NPRO token contract
const NPRO_TOKEN = "npro.nearmobile.near";

const PRICE_TIMEOUT_MS = 5000;
const PRICE_CACHE_KEY = "price";

// ============================================================================
// NEAR/USD PRICE FROM COINGECKO
// ============================================================================

interface CoinGeckoSimplePrice {
    near: {
        usd: number;
    };
}

async function getNearUsdPrice(): Promise<number> {
    try {
        const response = await fetch(`${COINGECKO_API_URL}/simple/price?ids=near&vs_currencies=usd`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = (await response.json()) as CoinGeckoSimplePrice;
        return data.near.usd;
    } catch (err) {
        logger.error({ err }, "failed to fetch NEAR/USD price");
        throw new Error("Unable to fetch NEAR/USD price");
    }
}

// ============================================================================
// NPRO PRICE FROM RHEA FINANCE API
// ============================================================================

// Rhea Finance API returns prices in this format
interface RheaTokenPrice {
    price: string;
    symbol: string;
    decimal: number;
}

type RheaTokenPrices = Record<string, RheaTokenPrice>;

/**
 * Fetch NPRO price from Rhea Finance API
 * The API returns USD prices directly for all tokens
 */
async function getNproPriceFromRheaFinance(): Promise<{ priceUsd: number; priceNear: number } | null> {
    try {
        const response = await fetch(`${RHEA_FINANCE_API_URL}/list-token-price`, {
            headers: {
                Accept: "*/*",
                "Content-Type": "application/json; charset=UTF-8",
                Referer: "https://app.rhea.finance/",
            },
            signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`Rhea Finance API error: ${response.status}`);
        }

        const prices = (await response.json()) as RheaTokenPrices;

        // Look for NPRO token price
        const nproEntry = prices[NPRO_TOKEN];
        if (!nproEntry) {
            logger.warn("NPRO not found on Rhea Finance API");
            return null;
        }

        const nproPriceUsd = parseFloat(nproEntry.price);

        if (isNaN(nproPriceUsd) || nproPriceUsd <= 0) {
            return null;
        }

        // Get NEAR price to calculate NPRO/NEAR ratio
        const wrapNearEntry = prices["wrap.near"];
        const nearPriceUsd = wrapNearEntry ? parseFloat(wrapNearEntry.price) : null;

        const priceNear = nearPriceUsd && nearPriceUsd > 0 ? nproPriceUsd / nearPriceUsd : 0;

        return {
            priceUsd: nproPriceUsd,
            priceNear,
        };
    } catch (err) {
        logger.error({ err }, "failed to fetch NPRO price from Rhea Finance");
        return null;
    }
}

// ============================================================================
// COMBINED PRICE FUNCTIONS
// ============================================================================

export interface PriceData {
    price_usd: number | null;
    price_near: number | null;
    near_usd: number;
}

/**
 * Fetch NPRO price data from upstream APIs (no cache).
 *
 * Exported for unit testing; production callers use the cached `getNproPriceData` below.
 */
export async function fetchNproPriceData(): Promise<PriceData> {
    const [rheaPrice, nearUsd] = await Promise.all([getNproPriceFromRheaFinance(), getNearUsdPrice()]);

    if (rheaPrice) {
        return {
            price_usd: rheaPrice.priceUsd,
            price_near: rheaPrice.priceNear,
            near_usd: nearUsd,
        };
    }

    // NPRO not found - return null prices but valid NEAR/USD
    return {
        price_usd: null,
        price_near: null,
        near_usd: nearUsd,
    };
}

/**
 * Cached NPRO price data. The TTL collapses request bursts into one upstream call, and
 * stale-if-error keeps serving the last known-good price across CoinGecko/Rhea blips.
 */
export async function getNproPriceData(): Promise<PriceData> {
    return cached({
        key: PRICE_CACHE_KEY,
        ttlMs: env.priceCacheTtlMs,
        fetcher: fetchNproPriceData,
    });
}

// ============================================================================
// 24H VOLUME
// ============================================================================

/**
 * 24h trading volume in USD.
 *
 * Intentionally returns `null`: neither CoinGecko nor Rhea expose a ready 24h volume for NPRO, and
 * computing it ourselves would require an indexer that tracks every swap event — out of scope for
 * this service. CG/CMC compute volume on their side from on-chain/DEX data, so returning `null`
 * (rather than a fabricated number) is the correct, honest response. The function is kept because
 * the /api/v1/token/npro route includes the field in its contract.
 */
export async function getNproVolume24hUsd(): Promise<number | null> {
    return null;
}

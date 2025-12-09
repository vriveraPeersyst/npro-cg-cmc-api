/**
 * Pricing Module
 * Fetches NPRO price data from Ref Finance indexer and CoinGecko
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";
const REF_FINANCE_API_URL = "https://indexer.ref.finance";

// NPRO token contract
const NPRO_TOKEN = "npro.nearmobile.near";

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
    const response = await fetch(
      `${COINGECKO_API_URL}/simple/price?ids=near&vs_currencies=usd`,
      {
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as CoinGeckoSimplePrice;
    return data.near.usd;
  } catch (error) {
    console.error("Failed to fetch NEAR/USD price:", error);
    throw new Error("Unable to fetch NEAR/USD price");
  }
}

// ============================================================================
// NPRO PRICE FROM REF FINANCE INDEXER
// ============================================================================

// Ref Finance indexer returns prices in this format
type RefTokenPrices = Record<string, { price: string } | string>;

/**
 * Fetch NPRO price from Ref Finance indexer
 * The indexer returns USD prices directly for all tokens
 * 
 * Once NPRO is listed/has liquidity, it will appear in this API
 */
async function getNproPriceFromRefFinance(): Promise<{ priceUsd: number; priceNear: number } | null> {
  try {
    const response = await fetch(`${REF_FINANCE_API_URL}/list-token-price`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Ref Finance API error: ${response.status}`);
    }

    const prices = (await response.json()) as RefTokenPrices;
    
    // Look for NPRO token price
    const nproEntry = prices[NPRO_TOKEN];
    if (!nproEntry) {
      console.log("NPRO not yet listed on Ref Finance indexer");
      return null;
    }

    // Handle both formats: { price: "0.123" } or just "0.123"
    const nproPriceUsd = typeof nproEntry === "string" 
      ? parseFloat(nproEntry)
      : parseFloat(nproEntry.price);

    if (isNaN(nproPriceUsd) || nproPriceUsd <= 0) {
      return null;
    }

    // Get NEAR price to calculate NPRO/NEAR ratio
    const wrapNearEntry = prices["wrap.near"];
    const nearPriceUsd = wrapNearEntry
      ? (typeof wrapNearEntry === "string" ? parseFloat(wrapNearEntry) : parseFloat(wrapNearEntry.price))
      : null;

    const priceNear = nearPriceUsd && nearPriceUsd > 0 
      ? nproPriceUsd / nearPriceUsd 
      : 0;

    return {
      priceUsd: nproPriceUsd,
      priceNear,
    };
  } catch (error) {
    console.error("Failed to fetch from Ref Finance:", error);
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
 * Get NPRO price data
 * Fetches from Ref Finance indexer (returns null if NPRO not yet listed)
 */
export async function getNproPriceData(): Promise<PriceData> {
  const [refPrice, nearUsd] = await Promise.all([
    getNproPriceFromRefFinance(),
    getNearUsdPrice(),
  ]);

  if (refPrice) {
    return {
      price_usd: refPrice.priceUsd,
      price_near: refPrice.priceNear,
      near_usd: nearUsd,
    };
  }

  // NPRO not yet listed - return null prices but valid NEAR/USD
  return {
    price_usd: null,
    price_near: null,
    near_usd: nearUsd,
  };
}

/**
 * Get NPRO USD price only
 */
export async function getNproUsdPrice(): Promise<number | null> {
  const data = await getNproPriceData();
  return data.price_usd;
}

// ============================================================================
// 24H VOLUME
// ============================================================================

/**
 * Get 24h trading volume in USD
 * 
 * TODO: Implement actual volume tracking from Rhea analytics or your indexer
 */
export async function getNproVolume24hUsd(): Promise<number | null> {
  // Volume tracking requires either:
  // 1. Rhea SDK analytics (when available)
  // 2. Your own indexer tracking swap events
  // 3. Third-party analytics API
  
  // For now, return null - CG/CMC will track volume independently
  return null;
}

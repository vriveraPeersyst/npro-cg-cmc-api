import { NextRequest, NextResponse } from "next/server";
import { getSuppliesFromChain } from "@/lib/near";
import { getNproPriceData, getNproVolume24hUsd } from "@/lib/pricing";

// Revalidate every 60 seconds (ISR)
export const revalidate = 60;

// Enable edge runtime for better performance on Vercel
// Comment this out if you need Node.js-specific features
// export const runtime = "edge";

interface NproTokenResponse {
  symbol: string;
  name: string;
  currency: string;
  price: string | null;
  market_cap: string | null;
  fully_diluted_valuation: string | null;
  volume_24h: string | null;
  circulating_supply: string;
  total_supply: string;
  max_supply: string;
  last_updated: string;
  // Additional metadata for transparency
  _meta?: {
    price_source: string;
    supply_source: string;
    near_usd_price?: string;
    npro_near_price?: string;
  };
}

function numToString(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  // Format with reasonable precision for currency values
  return n.toFixed(n < 1 ? 8 : 2);
}

function supplyToString(n: number): string {
  return Math.floor(n).toString();
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeMeta = searchParams.get("meta") === "true";
    const currency = "USD"; // Can be extended to support other currencies

    // Fetch all data in parallel for best performance
    const [supplies, priceData, volume24hUsd] = await Promise.all([
      getSuppliesFromChain(),
      getNproPriceData().catch((e) => {
        console.error("Price fetch failed:", e);
        return null;
      }),
      getNproVolume24hUsd().catch((e) => {
        console.error("Volume fetch failed:", e);
        return null;
      }),
    ]);

    // Calculate market metrics
    const priceUsd = priceData?.price_usd ?? null;
    const marketCap = priceUsd !== null 
      ? priceUsd * supplies.circulating_supply 
      : null;
    const fdv = priceUsd !== null 
      ? priceUsd * supplies.total_supply 
      : null;

    const response: NproTokenResponse = {
      symbol: "NPRO",
      name: "NPRO",
      currency,
      price: numToString(priceUsd),
      market_cap: numToString(marketCap),
      fully_diluted_valuation: numToString(fdv),
      volume_24h: numToString(volume24hUsd),
      circulating_supply: supplyToString(supplies.circulating_supply),
      total_supply: supplyToString(supplies.total_supply),
      max_supply: supplyToString(supplies.max_supply),
      last_updated: new Date().toISOString(),
    };

    // Add metadata if requested (useful for debugging)
    if (includeMeta && priceData) {
      response._meta = {
        price_source: priceData.price_usd !== null ? "ref_finance" : "unavailable",
        supply_source: "near_blockchain",
        near_usd_price: priceData.near_usd.toFixed(4),
        npro_near_price: priceData.price_near?.toFixed(8) ?? "unavailable",
      };
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (error) {
    console.error("Error in /api/v1/token/npro:", error);
    
    return NextResponse.json(
      { 
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { 
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

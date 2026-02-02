import { NextResponse } from "next/server";
import { getSuppliesFromChain } from "@/lib/near";

// Force dynamic rendering - always fetch fresh data from chain
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/total-supply
 * 
 * Returns the total supply as a plain number.
 * This format is commonly used by CoinGecko, CoinMarketCap, and other aggregators.
 */
export async function GET() {
  try {
    const supplies = await getSuppliesFromChain();

    // Return plain text number (standard format for aggregators)
    return new NextResponse(supplies.total_supply.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        // Short cache (30s) with minimal stale window (30s) for fresher data
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (error) {
    console.error("Error fetching total supply:", error);
    return new NextResponse("Error fetching supply data", {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}

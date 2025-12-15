import { NextResponse } from "next/server";
import { getSuppliesFromChain } from "@/lib/near";

// Revalidate every 60 seconds (ISR)
export const revalidate = 60;

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
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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

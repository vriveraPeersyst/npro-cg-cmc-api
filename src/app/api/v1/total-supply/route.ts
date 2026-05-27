import { NextResponse } from "next/server";

import { getSuppliesFromChain } from "@/lib/near";
import { logger } from "@/lib/logger";

// Force dynamic so every request reads the live cached value. The real caching lives in the data
// layer (`getSuppliesFromChain` -> lib/cache, TTL + stale-if-error); on Railway there is no CDN, so
// each request just reads the in-memory Map in microseconds rather than re-hitting the RPC.
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

        return new NextResponse(supplies.total_supply.toString(), {
            status: 200,
            headers: {
                "Content-Type": "text/plain",
                // Advisory only: Railway has no CDN, so this is honoured solely by browsers and any
                // intermediary proxy a future deployment might place in front. The data layer is the
                // real cache.
                "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
            },
        });
    } catch (err) {
        // Only reachable on a cold start with the upstream RPC down (no cached value to serve stale).
        logger.error({ err }, "failed to serve total supply");
        return new NextResponse("Error fetching supply data", {
            status: 500,
            headers: {
                "Content-Type": "text/plain",
            },
        });
    }
}

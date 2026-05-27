import { NextRequest, NextResponse } from "next/server";

import { getSuppliesFromChain } from "@/lib/near";
import { logger } from "@/lib/logger";
import { getNproPriceData, getNproVolume24hUsd } from "@/lib/pricing";

// Force dynamic so every request reads the live cached values. The single source of truth for
// caching is the data layer (`getSuppliesFromChain` / `getNproPriceData` -> lib/cache, TTL +
// stale-if-error). We deliberately do NOT layer Next's ISR (`revalidate`) on top: mixing two caches
// makes staleness unpredictable. On Railway (no CDN) each request just reads the in-memory cache.
export const dynamic = "force-dynamic";

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
            getNproPriceData().catch((err) => {
                logger.error({ err }, "price fetch failed in /api/v1/token/npro");
                return null;
            }),
            getNproVolume24hUsd().catch((err) => {
                logger.error({ err }, "volume fetch failed in /api/v1/token/npro");
                return null;
            }),
        ]);

        // Calculate market metrics
        const priceUsd = priceData?.price_usd ?? null;
        const marketCap = priceUsd !== null ? priceUsd * supplies.circulating_supply : null;
        const fdv = priceUsd !== null ? priceUsd * supplies.total_supply : null;

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
                price_source: priceData.price_usd !== null ? "rhea_finance" : "unavailable",
                supply_source: "near_blockchain",
                near_usd_price: priceData.near_usd.toFixed(4),
                npro_near_price: priceData.price_near?.toFixed(8) ?? "unavailable",
            };
        }

        return NextResponse.json(response, {
            status: 200,
            headers: {
                // Advisory only: Railway has no CDN, so this is honoured solely by browsers and any
                // intermediary proxy a future deployment might place in front. The data layer is the
                // real cache.
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET",
            },
        });
    } catch (err) {
        // Only reachable on a cold start with the upstream RPC down (no cached supply to serve stale).
        logger.error({ err }, "failed to serve /api/v1/token/npro");

        return NextResponse.json(
            {
                error: "internal_error",
                message: err instanceof Error ? err.message : "Unknown error",
            },
            {
                status: 500,
                headers: {
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": "*",
                },
            },
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

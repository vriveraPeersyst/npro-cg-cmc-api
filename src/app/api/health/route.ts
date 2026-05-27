import { NextResponse } from "next/server";

// Always evaluate at request time so the healthcheck reflects live process state, never a cached snapshot.
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness probe consumed by Railway's healthcheck (configured in railway.json).
 * Returns 200 with a minimal JSON body and is explicitly uncacheable.
 */
export async function GET() {
    return NextResponse.json(
        { status: "ok" },
        {
            status: 200,
            headers: {
                "Cache-Control": "no-store",
            },
        },
    );
}

# NPRO Token API

CoinGecko / CoinMarketCap compatible API for NPRO token data.

## Features

- **On-chain supply data** from the NEAR blockchain
- **Real-time pricing** from Rhea Finance (NPRO) and CoinGecko (NEAR/USD)
- **CG/CMC compatible** JSON response format
- **Server-side caching** (TTL + stale-if-error) for fast, resilient responses
- **Deployed on Railway** via a standalone Docker image

## API Endpoints

| Endpoint | Method | Content-Type | Description |
|----------|--------|--------------|-------------|
| `/api/v1/token/npro` | GET | `application/json` | Full CG/CMC token payload |
| `/api/v1/total-supply` | GET | `text/plain` | Total minted supply as a plain number |
| `/api/v1/circulating-supply` | GET | `text/plain` | Circulating supply as a plain number |
| `/api/health` | GET | `application/json` | Liveness probe (used by the Railway healthcheck) |

### Query Parameters

| Parameter | Endpoint | Description |
|-----------|----------|-------------|
| `meta=true` | `/api/v1/token/npro` | Include additional metadata (price sources, etc.) |

### `/api/v1/token/npro` response

```json
{
  "symbol": "NPRO",
  "name": "NPRO",
  "currency": "USD",
  "price": "0.01234",
  "market_cap": "123456.00",
  "fully_diluted_valuation": "1234567.00",
  "volume_24h": null,
  "circulating_supply": "735000",
  "total_supply": "10000000",
  "max_supply": "10000000",
  "last_updated": "2025-12-09T12:34:56Z"
}
```

> **Note:** `price`, `market_cap`, and `fully_diluted_valuation` are `null` until NPRO is
> listed on Rhea Finance. `volume_24h` is always `null`: neither CoinGecko nor Rhea expose a
> ready 24h volume for NPRO, and CG/CMC compute volume on their side, so returning `null`
> (rather than a fabricated number) is the correct response.

### Fields Mapping

| API Field | Description (ES) |
|-----------|------------------|
| `market_cap` | Cap. de mercado |
| `fully_diluted_valuation` | Valoración tras la dilución total |
| `volume_24h` | Vol. comercio 24 h |
| `circulating_supply` | Cantidad circulante |
| `total_supply` | Cantidad total |
| `max_supply` | Cantidad máx. |

## Data Sources

- **Supply:** NEAR blockchain — on-chain reads of the NPRO token contract (`npro.nearmobile.near`).
- **NPRO price:** Rhea Finance (`https://api.rhea.finance`).
- **NEAR/USD price:** CoinGecko (`https://api.coingecko.com`).

## Supply Calculation

**Circulating Supply** excludes these locked accounts:

- `npro-staking.sputnik-dao.near`
- `npro-treasury.sputnik-dao.near`
- `npro-marketing.sputnik-dao.near`
- `npro-liquidity.sputnik-dao.near`
- `npro-team.sputnik-dao.near`
- `distributor.nearmobile.near`
- `distribution.nearmobile.near`
- `claim.nearmobile.near`

```
circulating_supply = total_supply - Σ(excluded_balances)
```

## Performance & Reliability

The API depends on slow upstreams (NEAR RPC, CoinGecko, Rhea). Each `/api/v1/token/npro`
request would otherwise hit the RPC ~9 times. Two layers keep it fast and resilient:

- **Server-side cache** (`src/lib/cache.ts`): a TTL cache that collapses request bursts into a
  single upstream call and serves the last known-good value if upstream is down (stale-if-error).
  This is the **single source of truth for caching** — the route handlers are `force-dynamic` and
  just read this in-memory cache.
- **RPC failover with timeouts** (`src/lib/rpc-manager.ts` + `AbortSignal.timeout`): rotates
  across NEAR RPC endpoints, blacklisting failing ones, and bounds every fetch so a hung node
  never hangs a request.

> Railway does **not** ship a CDN, so the `Cache-Control` headers on the responses are advisory
> (honoured by browsers / any future intermediary proxy). The server-side cache above is what
> actually delivers the low latency that the Vercel edge previously provided.

## Deployment (Railway)

The app builds a standalone Next.js server (`output: "standalone"` in `next.config.ts`) packaged
as a multi-stage Docker image. Railway builds the `Dockerfile` and runs the container.

1. Create a Railway project and connect this repository.
2. Railway reads `railway.json`:
   - `build.builder = "DOCKERFILE"` (builds `Dockerfile`).
   - `deploy.healthcheckPath = "/api/health"` — Railway waits for a `200` before routing traffic.
3. Set environment variables (see below) in **Project → Variables**. None are required; all have
   safe defaults. Railway injects `PORT` automatically and Next reads it natively — do not set it.
4. Deploy. Railway runs the container's `node server.js` (the standalone entrypoint).

## Environment Variables

Every variable is **optional**; `src/lib/env.ts` reads each with a safe default, so the app boots
with none set. See `.env.example`.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEAR_RPC_URL` | (built-in list) | Override the NEAR RPC URL. When unset, the RPC manager uses its built-in endpoint list with failover. |
| `LOG_LEVEL` | `info` | pino log level (`trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`). |
| `SUPPLY_CACHE_TTL_MS` | `30000` | TTL for the on-chain supply cache, in milliseconds. |
| `PRICE_CACHE_TTL_MS` | `60000` | TTL for the price cache, in milliseconds. |

> `PORT` is injected by Railway at runtime and read natively by Next — do not set it manually.

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000/api/v1/token/npro` to test the API.

### Scripts

```bash
npm run lint        # ESLint (flat config)
npm run typecheck   # tsc --noEmit
npm test            # Vitest (unit tests for the data/reliability layer)
npm run build       # Production build (.next/standalone)
```

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── health/
│   │   │   └── route.ts                # Liveness probe (Railway healthcheck)
│   │   └── v1/
│   │       ├── token/
│   │       │   └── npro/
│   │       │       └── route.ts        # CG/CMC token payload (JSON)
│   │       ├── total-supply/
│   │       │   └── route.ts            # Total supply (text/plain)
│   │       └── circulating-supply/
│   │           └── route.ts            # Circulating supply (text/plain)
│   ├── layout.tsx
│   └── page.tsx                        # Documentation page
└── lib/
    ├── env.ts                          # Typed, centralized config (only reader of process.env)
    ├── logger.ts                       # Structured logging (pino)
    ├── cache.ts                        # TTL cache with stale-if-error fallback
    ├── rpc-manager.ts                  # NEAR RPC failover across endpoints
    ├── near.ts                         # On-chain supply integration
    └── pricing.ts                      # Price feeds (Rhea Finance, CoinGecko)
```

## CoinGecko / CMC Submission

Once deployed, provide the endpoint URL to CG/CMC:

```
https://<your-railway-domain>/api/v1/token/npro
```

Key requirements:
- ✅ Public access (no auth)
- ✅ JSON response
- ✅ All required fields
- ✅ CORS enabled
- ✅ String values for precision

## License

MIT

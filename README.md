# NPRO Token API

CoinGecko / CoinMarketCap compatible API for NPRO token data.

## Features

- **On-chain supply data** from NEAR blockchain
- **Real-time pricing** via Ref Finance indexer
- **CG/CMC compatible** JSON response format
- **Serverless** deployment on Vercel

## API Endpoint

```
GET /api/v1/token/npro
```

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `meta=true` | Include additional metadata (price sources, etc.) |

### Response

```json
{
  "symbol": "NPRO",
  "name": "NPRO",
  "currency": "USD",
  "price": "0.01234",
  "market_cap": "123456.00",
  "fully_diluted_valuation": "1234567.00",
  "volume_24h": "5678.00",
  "circulating_supply": "735000",
  "total_supply": "10000000",
  "max_supply": "10000000",
  "last_updated": "2025-12-09T12:34:56Z"
}
```

> **Note:** `price`, `market_cap`, `fully_diluted_valuation`, and `volume_24h` will be `null` until NPRO is listed on Ref Finance indexer.

### Fields Mapping

| API Field | Description (ES) |
|-----------|------------------|
| `market_cap` | Cap. de mercado |
| `fully_diluted_valuation` | Valoración tras la dilución total |
| `volume_24h` | Vol. comercio 24 h |
| `circulating_supply` | Cantidad circulante |
| `total_supply` | Cantidad total |
| `max_supply` | Cantidad máx. |

## Supply Calculation

**Circulating Supply** excludes these locked accounts:

- `npro-staking.sputnik-dao.near`
- `npro-treasury.sputnik-dao.near`
- `npro-marketing.sputnik-dao.near`
- `npro-liquidity.sputnik-dao.near`
- `npro-team.sputnik-dao.near`

```
circulating_supply = total_supply - Σ(excluded_balances)
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com/new)
3. Deploy!

Or use the CLI:

```bash
npm i -g vercel
vercel --prod
```

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000/api/v1/token/npro` to test the API.

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── token/
│   │           └── npro/
│   │               └── route.ts    # Main API endpoint
│   ├── layout.tsx
│   └── page.tsx                    # Documentation page
└── lib/
    ├── near.ts                     # NEAR blockchain integration
    └── pricing.ts                  # Price feeds (Ref Finance, CoinGecko)
```

## CoinGecko / CMC Submission

Once deployed, provide the endpoint URL to CG/CMC:

```
https://your-domain.vercel.app/api/v1/token/npro
```

Key requirements:
- ✅ Public access (no auth)
- ✅ JSON response
- ✅ All required fields
- ✅ CORS enabled
- ✅ String values for precision

## License

MIT

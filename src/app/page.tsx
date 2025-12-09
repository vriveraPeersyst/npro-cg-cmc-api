export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">NPRO Token API</h1>
        <p className="text-gray-600 mb-8">
          CoinGecko / CoinMarketCap compatible API for NPRO token data.
        </p>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-3">Endpoint</h2>
          <code className="block bg-gray-100 p-3 rounded text-sm">
            GET /api/v1/token/npro
          </code>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-3">Query Parameters</h2>
          <ul className="list-disc list-inside text-gray-600">
            <li>
              <code className="bg-gray-100 px-1 rounded">meta=true</code> - Include additional metadata
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-3">Response Fields</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Field</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b">
                <td className="py-2"><code>price</code></td>
                <td>Current price in USD</td>
              </tr>
              <tr className="border-b">
                <td className="py-2"><code>market_cap</code></td>
                <td>Market capitalization (price × circulating supply)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2"><code>fully_diluted_valuation</code></td>
                <td>FDV (price × total supply)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2"><code>volume_24h</code></td>
                <td>24-hour trading volume in USD</td>
              </tr>
              <tr className="border-b">
                <td className="py-2"><code>circulating_supply</code></td>
                <td>Tokens in circulation (excludes locked accounts)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2"><code>total_supply</code></td>
                <td>Total minted tokens</td>
              </tr>
              <tr>
                <td className="py-2"><code>max_supply</code></td>
                <td>Maximum supply (10,000,000 NPRO)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-center text-gray-400 mt-8 text-sm">
          Powered by NEAR Protocol
        </p>
      </div>
    </main>
  );
}

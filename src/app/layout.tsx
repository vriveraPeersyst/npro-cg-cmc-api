import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NPRO Token API",
  description: "CoinGecko / CoinMarketCap compatible API for NPRO token data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

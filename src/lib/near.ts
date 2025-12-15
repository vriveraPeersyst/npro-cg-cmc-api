/**
 * NEAR Blockchain Integration
 * Fetches on-chain supply data for NPRO token
 */

const NEAR_RPC_URL = "https://rpc.mainnet.near.org";
const TOKEN_CONTRACT = "npro.nearmobile.near";

const EXCLUDED_ACCOUNTS = [
  "npro-staking.sputnik-dao.near",
  "npro-treasury.sputnik-dao.near",
  "npro-marketing.sputnik-dao.near",
  "npro-liquidity.sputnik-dao.near",
  "npro-team.sputnik-dao.near",
  "distributor.nearmobile.near",
];

const DECIMALS = 24n;
const YOCTO_DENOM = 10n ** DECIMALS;
const MAX_SUPPLY_TOKENS = 10_000_000;

interface RpcResponse<T> {
  jsonrpc: string;
  id: string;
  result?: {
    result: number[];
  };
  error?: {
    code: number;
    message: string;
    data?: string;
  };
}

/**
 * Make a direct JSON-RPC call to NEAR
 * This is more lightweight than using near-api-js for view-only calls
 */
async function callViewMethod(
  methodName: string,
  args: Record<string, unknown>
): Promise<string> {
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");

  const response = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "dontcare",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: TOKEN_CONTRACT,
        method_name: methodName,
        args_base64: argsBase64,
      },
    }),
  });

  const data = (await response.json()) as RpcResponse<unknown>;

  if (data.error) {
    throw new Error(`NEAR RPC error: ${data.error.message}`);
  }

  if (!data.result?.result) {
    throw new Error("Invalid response from NEAR RPC");
  }

  // Decode the result bytes to string
  const resultBytes = new Uint8Array(data.result.result);
  const resultString = new TextDecoder().decode(resultBytes);
  
  // The result is JSON-encoded, so parse it (it's typically a quoted string for supplies)
  return JSON.parse(resultString);
}

async function getTotalSupplyYocto(): Promise<bigint> {
  const res = await callViewMethod("ft_total_supply", {});
  return BigInt(res);
}

async function getBalanceYocto(accountId: string): Promise<bigint> {
  try {
    const res = await callViewMethod("ft_balance_of", { account_id: accountId });
    return BigInt(res);
  } catch (error) {
    // If account doesn't exist or has no balance, return 0
    console.warn(`Could not fetch balance for ${accountId}:`, error);
    return 0n;
  }
}

export interface SupplyData {
  total_supply: number;
  circulating_supply: number;
  max_supply: number;
  total_supply_raw: string;
  circulating_supply_raw: string;
}

/**
 * Fetch all supply data from the NEAR blockchain
 */
export async function getSuppliesFromChain(): Promise<SupplyData> {
  const totalYocto = await getTotalSupplyYocto();

  // Fetch all excluded account balances in parallel
  const nonCircBalances = await Promise.all(
    EXCLUDED_ACCOUNTS.map(getBalanceYocto)
  );

  const nonCircYocto = nonCircBalances.reduce((acc, v) => acc + v, 0n);
  const circulatingYocto = totalYocto - nonCircYocto;

  // Convert yocto -> whole tokens (truncates fractional dust)
  const totalTokens = Number(totalYocto / YOCTO_DENOM);
  const circulatingTokens = Number(circulatingYocto / YOCTO_DENOM);

  return {
    total_supply: totalTokens,
    circulating_supply: circulatingTokens,
    max_supply: MAX_SUPPLY_TOKENS,
    // Keep raw values for precision if needed
    total_supply_raw: totalYocto.toString(),
    circulating_supply_raw: circulatingYocto.toString(),
  };
}

export { EXCLUDED_ACCOUNTS, TOKEN_CONTRACT };

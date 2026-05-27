/**
 * NEAR Blockchain Integration
 * Fetches on-chain supply data for NPRO token
 */

import { cached } from "./cache";
import { env } from "./env";
import { logger } from "./logger";
import { rpcManager } from "./rpc-manager";

const TOKEN_CONTRACT = "npro.nearmobile.near";

const RPC_TIMEOUT_MS = 5000;
const SUPPLY_CACHE_KEY = "supplies";

const EXCLUDED_ACCOUNTS = [
    "npro-staking.sputnik-dao.near",
    "npro-treasury.sputnik-dao.near",
    "npro-marketing.sputnik-dao.near",
    "npro-liquidity.sputnik-dao.near",
    "npro-team.sputnik-dao.near",
    "distributor.nearmobile.near",
    "distribution.nearmobile.near",
    "claim.nearmobile.near",
];

const DECIMALS = 24n;
const YOCTO_DENOM = 10n ** DECIMALS;
const MAX_SUPPLY_TOKENS = 10_000_000;

interface RpcResponse {
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
 * Make a direct JSON-RPC call to NEAR with automatic failover
 * Uses the RPC manager to handle multiple endpoints
 */
async function callViewMethod(methodName: string, args: Record<string, unknown>): Promise<string> {
    const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");

    return rpcManager.makeRequest(async (rpcUrl: string) => {
        const response = await fetch(rpcUrl, {
            method: "POST",
            // Without a timeout a hung RPC would hang the whole request (general.md §"Timeout en fetches").
            signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
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

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as RpcResponse;

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
    });
}

async function getTotalSupplyYocto(): Promise<bigint> {
    const res = await callViewMethod("ft_total_supply", {});
    return BigInt(res);
}

async function getBalanceYocto(accountId: string): Promise<bigint> {
    try {
        const res = await callViewMethod("ft_balance_of", { account_id: accountId });
        return BigInt(res);
    } catch (err) {
        // A non-existent account (or one with no balance) contributes 0 to the excluded total.
        logger.warn({ err, accountId }, "could not fetch balance, treating as 0");
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
 * Fetch all supply data directly from the NEAR blockchain (no cache).
 *
 * Exported for unit testing; production callers use the cached `getSuppliesFromChain` below.
 * One request hits the RPC ~9 times (1 total_supply + N excluded balances), which is why the
 * public entry point is cached.
 */
export async function fetchSuppliesFromChain(): Promise<SupplyData> {
    const totalYocto = await getTotalSupplyYocto();

    // Fetch all excluded account balances in parallel
    const nonCircBalances = await Promise.all(EXCLUDED_ACCOUNTS.map(getBalanceYocto));

    const nonCircYocto = nonCircBalances.reduce((acc, v) => acc + v, 0n);
    const circulatingYocto = totalYocto - nonCircYocto;

    // All math stays in bigint (yocto). The cast to Number for the whole-token display fields is a
    // deliberate, safe exception to nextjs-judgment §"amounts on-chain -> bigint always": supplies are
    // capped at MAX_SUPPLY_TOKENS (10M), far below Number.MAX_SAFE_INTEGER, and we truncate the
    // sub-token dust on purpose. The `_raw` yocto strings preserve full precision for any caller.
    const totalTokens = Number(totalYocto / YOCTO_DENOM);
    const circulatingTokens = Number(circulatingYocto / YOCTO_DENOM);

    return {
        total_supply: totalTokens,
        circulating_supply: circulatingTokens,
        max_supply: MAX_SUPPLY_TOKENS,
        total_supply_raw: totalYocto.toString(),
        circulating_supply_raw: circulatingYocto.toString(),
    };
}

/**
 * Cached supply data. The TTL absorbs request bursts into a single on-chain read, and
 * stale-if-error keeps serving the last known-good supply if the RPC layer is down.
 */
export async function getSuppliesFromChain(): Promise<SupplyData> {
    return cached({
        key: SUPPLY_CACHE_KEY,
        ttlMs: env.supplyCacheTtlMs,
        fetcher: fetchSuppliesFromChain,
    });
}

export { EXCLUDED_ACCOUNTS, TOKEN_CONTRACT };

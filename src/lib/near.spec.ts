import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The RPC manager just hands a URL to the request closure; here it runs that closure once against a
// fake URL so the real JSON-RPC encode/decode path in callViewMethod is exercised against a stubbed fetch.
vi.mock("./rpc-manager", () => ({
    rpcManager: {
        makeRequest: <T>(fn: (rpcUrl: string) => Promise<T>): Promise<T> => fn("https://fake-rpc.test"),
    },
}));

import { EXCLUDED_ACCOUNTS, fetchSuppliesFromChain, TOKEN_CONTRACT } from "./near";

const DECIMALS = 24n;
const YOCTO = 10n ** DECIMALS;

/** Build the NEAR JSON-RPC success envelope: result is the JSON string encoded as a UTF-8 byte array. */
function rpcResult(value: string): unknown {
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(value)));
    return { jsonrpc: "2.0", id: "dontcare", result: { result: bytes } };
}

function decodeBody(init: RequestInit | undefined): { methodName: string; accountId?: string } {
    const body = JSON.parse(String(init?.body)) as { params: { method_name: string; args_base64: string } };
    const args = JSON.parse(Buffer.from(body.params.args_base64, "base64").toString("utf-8")) as {
        account_id?: string;
    };
    return { methodName: body.params.method_name, accountId: args.account_id };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("fetchSuppliesFromChain", () => {
    it("computes circulating = total - sum(excluded), in whole tokens, with raw yocto preserved", async () => {
        const totalYocto = 5_000_000n * YOCTO;
        // Two excluded accounts hold 1M each; the rest hold 0.
        const balances: Record<string, bigint> = {
            [EXCLUDED_ACCOUNTS[0]]: 1_000_000n * YOCTO,
            [EXCLUDED_ACCOUNTS[1]]: 1_000_000n * YOCTO,
        };

        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                const { methodName, accountId } = decodeBody(init);
                if (methodName === "ft_total_supply") {
                    return { ok: true, json: async () => rpcResult(totalYocto.toString()) } as Response;
                }
                const balance = (accountId !== undefined ? balances[accountId] : undefined) ?? 0n;
                return { ok: true, json: async () => rpcResult(balance.toString()) } as Response;
            }),
        );

        const supplies = await fetchSuppliesFromChain();

        const expectedCirculatingYocto = totalYocto - 2_000_000n * YOCTO;
        // Bug this catches: wrong circulating math (e.g. not subtracting excluded balances).
        expect(supplies.total_supply).toBe(5_000_000);
        expect(supplies.circulating_supply).toBe(3_000_000);
        expect(supplies.max_supply).toBe(10_000_000);
        // Raw strings keep full yocto precision regardless of the whole-token truncation.
        expect(supplies.total_supply_raw).toBe(totalYocto.toString());
        expect(supplies.circulating_supply_raw).toBe(expectedCirculatingYocto.toString());
    });

    it("truncates sub-token dust to whole tokens while keeping the exact raw value", async () => {
        // 1,234 tokens + 0.5 token of dust.
        const totalYocto = 1_234n * YOCTO + YOCTO / 2n;

        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                const { methodName } = decodeBody(init);
                const value = methodName === "ft_total_supply" ? totalYocto.toString() : "0";
                return { ok: true, json: async () => rpcResult(value) } as Response;
            }),
        );

        const supplies = await fetchSuppliesFromChain();

        // Bug this catches: rounding instead of truncating dust, or losing precision in the raw field.
        expect(supplies.total_supply).toBe(1_234);
        expect(supplies.total_supply_raw).toBe(totalYocto.toString());
    });

    it("treats a failing balance lookup as 0 so one bad account does not break the whole supply", async () => {
        const totalYocto = 2_000_000n * YOCTO;

        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                const { methodName, accountId } = decodeBody(init);
                if (methodName === "ft_total_supply") {
                    return { ok: true, json: async () => rpcResult(totalYocto.toString()) } as Response;
                }
                if (accountId === EXCLUDED_ACCOUNTS[0]) {
                    // Simulate "account does not exist" -> getBalanceYocto swallows and returns 0.
                    return { ok: false, status: 400, statusText: "Bad Request" } as Response;
                }
                return { ok: true, json: async () => rpcResult("0") } as Response;
            }),
        );

        const supplies = await fetchSuppliesFromChain();

        // Bug this catches: a single missing excluded account throwing and failing the whole supply read.
        expect(supplies.total_supply).toBe(2_000_000);
        expect(supplies.circulating_supply).toBe(2_000_000);
    });

    it("queries the configured NPRO token contract", async () => {
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as { params: { account_id: string; method_name: string } };
            const value = body.params.method_name === "ft_total_supply" ? (YOCTO * 10n).toString() : "0";
            // Assert the contract address inline so a regression surfaces in this test.
            expect(body.params.account_id).toBe(TOKEN_CONTRACT);
            return { ok: true, json: async () => rpcResult(value) } as Response;
        });
        vi.stubGlobal("fetch", fetchMock);

        await fetchSuppliesFromChain();

        expect(fetchMock).toHaveBeenCalled();
    });
});

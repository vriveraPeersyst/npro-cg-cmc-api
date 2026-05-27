import { describe, expect, it, vi } from "vitest";

import { RpcManager } from "./rpc-manager";

// Zero backoff so the retry loop never touches real timers; we exercise the failover logic, not delays.
const NO_BACKOFF = (): number => 0;

const URLS = ["https://a.test", "https://b.test", "https://c.test"];

describe("RpcManager.makeRequest", () => {
    it("falls over to the next endpoint when the first one fails, then succeeds", async () => {
        const manager = new RpcManager({ urls: URLS, backoffMs: NO_BACKOFF });
        const requestFn = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValueOnce("ok");

        const result = await manager.makeRequest(requestFn);

        expect(result).toBe("ok");
        // Bug this catches: not advancing after a failure (retrying the same dead endpoint forever).
        expect(requestFn).toHaveBeenNthCalledWith(1, URLS[0]);
        expect(requestFn).toHaveBeenNthCalledWith(2, URLS[1]);
    });

    it("blacklists a rate-limited endpoint and switches away from it on the next call", async () => {
        const manager = new RpcManager({ urls: URLS, backoffMs: NO_BACKOFF });
        const requestFn = vi.fn().mockRejectedValueOnce(new Error("429 Too many requests")).mockResolvedValueOnce("ok");

        await manager.makeRequest(requestFn);

        const status = manager.getStatus();
        const first = status.endpoints.find((ep) => ep.url === URLS[0]);
        // Bug this catches: a single rate-limit not blacklisting (we keep hammering a throttled node).
        expect(first?.isBlacklisted).toBe(true);

        // A brand new request must NOT route back to the blacklisted endpoint.
        const next = vi.fn().mockResolvedValue("again");
        await manager.makeRequest(next);
        expect(next).toHaveBeenCalledWith(URLS[1]);
    });

    it("throws the last error when every endpoint fails", async () => {
        const manager = new RpcManager({ urls: URLS, backoffMs: NO_BACKOFF });
        const requestFn = vi
            .fn()
            .mockRejectedValueOnce(new Error("fail-a"))
            .mockRejectedValueOnce(new Error("fail-b"))
            .mockRejectedValueOnce(new Error("fail-c"));

        // Bug this catches: swallowing the failure and resolving undefined when all endpoints are down.
        await expect(manager.makeRequest(requestFn)).rejects.toThrow("fail-c");
        expect(requestFn).toHaveBeenCalledTimes(3);
    });

    it("keeps routing to a valid endpoint after blacklisting earlier ones (index fix)", async () => {
        const manager = new RpcManager({ urls: URLS, backoffMs: NO_BACKOFF });

        // First request: a and b are rate-limited (blacklisted), c succeeds.
        const burst = vi.fn().mockRejectedValueOnce(new Error("429")).mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce("ok-c");
        const firstResult = await manager.makeRequest(burst);

        expect(firstResult).toBe("ok-c");
        expect(burst).toHaveBeenNthCalledWith(3, URLS[2]);

        const status = manager.getStatus();
        expect(status.endpoints.find((ep) => ep.url === URLS[0])?.isBlacklisted).toBe(true);
        expect(status.endpoints.find((ep) => ep.url === URLS[1])?.isBlacklisted).toBe(true);
        expect(status.endpoints.find((ep) => ep.url === URLS[2])?.isBlacklisted).toBe(false);

        // The original bug: indexing a shrinking filtered array could point out of range or alias a
        // blacklisted endpoint. After two blacklists, the only valid target must still be served.
        const followUp = vi.fn().mockResolvedValue("ok-again");
        const followUpResult = await manager.makeRequest(followUp);

        expect(followUpResult).toBe("ok-again");
        expect(followUp).toHaveBeenCalledTimes(1);
        expect(followUp).toHaveBeenCalledWith(URLS[2]);
    });

    it("resets all endpoints when they are all blacklisted instead of getting stuck", async () => {
        const manager = new RpcManager({ urls: URLS, backoffMs: NO_BACKOFF });

        // Blacklist everyone via rate-limits; the manager runs out of retries (3) and throws.
        // (We don't inspect getStatus() here: reading the current endpoint resets an all-blacklisted
        // set, which is exactly the recovery we assert below.)
        const killAll = vi.fn().mockRejectedValue(new Error("429"));
        await expect(manager.makeRequest(killAll)).rejects.toThrow("429");

        // Next request: with all blacklisted, the manager resets and serves the first again.
        const recover = vi.fn().mockResolvedValue("recovered");
        const result = await manager.makeRequest(recover);

        // Bug this catches: a permanently stuck manager that never recovers after a full outage.
        expect(result).toBe("recovered");
        expect(recover).toHaveBeenCalledWith(URLS[0]);
    });
});

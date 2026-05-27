/**
 * RPC Manager for NEAR blockchain.
 *
 * Provides failover across several RPC endpoints: an endpoint is blacklisted after
 * `maxFailures` consecutive errors (or immediately on a rate-limit), and the manager
 * rotates to the next available one. When every endpoint is blacklisted the whole set
 * is reset so the service degrades but never gets permanently stuck.
 */

import { env } from "./env";
import { logger } from "./logger";

const DEFAULT_RPC_URLS = [
    "https://rpc.mainnet.near.org",
    "https://near.lava.build",
    "https://near.blockpi.network/v1/rpc/public",
    "https://rpc.shitzuapes.xyz",
    "https://rpc.fastnear.com",
];

const MAX_FAILURES = 3;
const BLACKLIST_DURATION_MS = 5 * 60 * 1000;
const MAX_RETRIES = 5;

interface RpcEndpoint {
    url: string;
    failures: number;
    lastFailure: number | null;
    isBlacklisted: boolean;
}

export interface RpcManagerOptions {
    /** Endpoint URLs to rotate over. Defaults to `env.nearRpcUrl` (if set) + the built-in list. */
    urls?: string[];
    /**
     * Backoff between retries, in milliseconds. Receives the 0-based attempt index. Injectable so
     * tests can use a zero backoff instead of waiting on real timers.
     */
    backoffMs?: (attempt: number) => number;
}

// Every retry switches to a different endpoint (handleFailure always advances the cursor), so there
// is no point backing off exponentially against a single node: a short fixed pause is enough to let
// the next endpoint breathe before we hit it.
const RETRY_BACKOFF_MS = 200;

function defaultBackoffMs(): number {
    return RETRY_BACKOFF_MS;
}

function resolveUrls(urls: string[] | undefined): string[] {
    if (urls !== undefined) {
        return urls;
    }
    // env.nearRpcUrl (when set) takes priority over the built-in list; process.env is never read here.
    return env.nearRpcUrl !== null ? [env.nearRpcUrl, ...DEFAULT_RPC_URLS] : DEFAULT_RPC_URLS;
}

function classifyError(error: unknown): "rate-limit" | "transient" | "other" {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: number | string } | null)?.code;
    const status = (error as { status?: number } | null)?.status;

    const isRateLimit =
        message.includes("rate") ||
        message.includes("429") ||
        message.includes("Too many requests") ||
        message.includes("throttle") ||
        message.includes("exceeded") ||
        message.includes("quota") ||
        code === 429 ||
        status === 429;
    if (isRateLimit) {
        return "rate-limit";
    }

    const isTransient =
        message.includes("ECONNRESET") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ENOTFOUND") ||
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("Timeout") ||
        message.includes("Failed to fetch") ||
        message.includes("fetch failed") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504") ||
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT" ||
        code === "ENOTFOUND" ||
        (status !== undefined && status >= 500);
    if (isTransient) {
        return "transient";
    }

    return "other";
}

export class RpcManager {
    private readonly endpoints: RpcEndpoint[];
    private readonly backoffMs: (attempt: number) => number;
    /**
     * Position into the STABLE `endpoints` array (never a filtered view). Blacklisting an endpoint
     * does not shift this array, so the cursor can never point past a removed entry or alias a
     * different endpoint. Rotation skips blacklisted endpoints at read time.
     */
    private cursor = 0;

    constructor(options: RpcManagerOptions = {}) {
        const seen = new Set<string>();
        this.endpoints = [];
        for (const url of resolveUrls(options.urls)) {
            const cleanUrl = url.trim();
            if (cleanUrl !== "" && !seen.has(cleanUrl)) {
                seen.add(cleanUrl);
                this.endpoints.push({ url: cleanUrl, failures: 0, lastFailure: null, isBlacklisted: false });
            }
        }
        this.backoffMs = options.backoffMs ?? defaultBackoffMs;

        logger.debug({ endpointCount: this.endpoints.length }, "rpc manager initialized");
    }

    async makeRequest<T>(requestFn: (rpcUrl: string) => Promise<T>): Promise<T> {
        const maxRetries = Math.min(this.endpoints.length, MAX_RETRIES);
        let lastError: unknown;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const endpoint = this.getCurrentEndpoint();
            if (endpoint === null) {
                throw new Error("No RPC endpoint available");
            }

            try {
                logger.debug({ attempt: attempt + 1, url: endpoint.url }, "rpc request attempt");
                const result = await requestFn(endpoint.url);
                endpoint.failures = 0;
                return result;
            } catch (error) {
                lastError = error;
                this.handleFailure(endpoint, error);

                if (attempt < maxRetries - 1) {
                    await delay(this.backoffMs(attempt));
                }
            }
        }

        logger.error({ err: lastError, maxRetries }, "all rpc attempts failed");
        throw lastError ?? new Error("All RPC endpoints failed");
    }

    getCurrentUrl(): string {
        return this.getCurrentEndpoint()?.url ?? "unknown";
    }

    getStatus(): {
        currentUrl: string;
        endpoints: { url: string; failures: number; isBlacklisted: boolean; lastFailure: number | null }[];
    } {
        return {
            currentUrl: this.getCurrentUrl(),
            endpoints: this.endpoints.map((ep) => ({
                url: ep.url,
                failures: ep.failures,
                isBlacklisted: ep.isBlacklisted,
                lastFailure: ep.lastFailure,
            })),
        };
    }

    /**
     * Return the endpoint at the cursor, advancing past blacklisted ones. If every endpoint is
     * blacklisted, reset them all (degraded but never stuck) and serve the first.
     */
    private getCurrentEndpoint(): RpcEndpoint | null {
        this.clearExpiredBlacklists();

        if (this.endpoints.length === 0) {
            return null;
        }

        for (let offset = 0; offset < this.endpoints.length; offset++) {
            const candidate = this.endpoints[(this.cursor + offset) % this.endpoints.length];
            if (!candidate.isBlacklisted) {
                this.cursor = (this.cursor + offset) % this.endpoints.length;
                return candidate;
            }
        }

        logger.warn("all rpc endpoints blacklisted, resetting");
        this.resetAllEndpoints();
        this.cursor = 0;
        return this.endpoints[0];
    }

    /** Advance the cursor to the next endpoint (read side skips blacklisted ones). */
    private advanceCursor(): void {
        this.cursor = (this.cursor + 1) % this.endpoints.length;
    }

    /** Record a failure, blacklist the endpoint if warranted, and always advance to the next one. */
    private handleFailure(endpoint: RpcEndpoint, error: unknown): void {
        endpoint.failures += 1;
        endpoint.lastFailure = Date.now();

        const kind = classifyError(error);

        if (kind === "rate-limit") {
            endpoint.isBlacklisted = true;
            logger.warn({ url: endpoint.url, reason: "rate-limit" }, "blacklisted rpc endpoint");
        } else if (endpoint.failures >= MAX_FAILURES) {
            endpoint.isBlacklisted = true;
            logger.warn({ url: endpoint.url, failures: endpoint.failures, reason: kind }, "blacklisted rpc endpoint");
        } else {
            logger.warn({ url: endpoint.url, failures: endpoint.failures, reason: kind }, "rpc failure, switching");
        }

        this.advanceCursor();
    }

    private clearExpiredBlacklists(): void {
        const now = Date.now();
        for (const endpoint of this.endpoints) {
            if (endpoint.isBlacklisted && endpoint.lastFailure !== null && now - endpoint.lastFailure > BLACKLIST_DURATION_MS) {
                endpoint.isBlacklisted = false;
                endpoint.failures = 0;
                logger.debug({ url: endpoint.url }, "cleared rpc blacklist");
            }
        }
    }

    private resetAllEndpoints(): void {
        for (const endpoint of this.endpoints) {
            endpoint.failures = 0;
            endpoint.isBlacklisted = false;
            endpoint.lastFailure = null;
        }
    }
}

function delay(ms: number): Promise<void> {
    if (ms <= 0) {
        return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Process-wide singleton used by the data layer. */
export const rpcManager = new RpcManager();

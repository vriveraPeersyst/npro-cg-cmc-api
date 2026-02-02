/**
 * RPC Manager for NEAR blockchain
 * Handles failover between multiple RPC endpoints for reliability
 */

interface RpcEndpoint {
  url: string;
  failures: number;
  lastFailure?: number;
  isBlacklisted: boolean;
}

class RpcManager {
  private endpoints: RpcEndpoint[] = [];
  private currentIndex: number = 0;
  private readonly maxFailures = 3;
  private readonly blacklistDuration = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initializeEndpoints();
  }

  private initializeEndpoints() {
    // Primary and fallback RPC endpoints for NEAR mainnet
    const rpcUrls = [
      process.env.NEAR_RPC_URL || "https://rpc.mainnet.near.org",
      "https://near.lava.build",
      "https://rpc.mainnet.near.org",
      "https://near.blockpi.network/v1/rpc/public",
      "https://rpc.shitzuapes.xyz",
      "https://rpc.fastnear.com",
    ];

    // Deduplicate and add endpoints
    const seen = new Set<string>();
    rpcUrls.forEach((url) => {
      const cleanUrl = url.trim();
      if (cleanUrl && !seen.has(cleanUrl)) {
        seen.add(cleanUrl);
        this.endpoints.push({
          url: cleanUrl,
          failures: 0,
          isBlacklisted: false,
        });
      }
    });

    console.log(
      `RPC Manager initialized with ${this.endpoints.length} endpoints:`,
      this.endpoints.map((ep) => ep.url)
    );
  }

  private clearExpiredBlacklists() {
    const now = Date.now();
    this.endpoints.forEach((endpoint) => {
      if (endpoint.isBlacklisted && endpoint.lastFailure) {
        if (now - endpoint.lastFailure > this.blacklistDuration) {
          endpoint.isBlacklisted = false;
          endpoint.failures = 0;
          console.log(`Cleared blacklist for ${endpoint.url}`);
        }
      }
    });
  }

  private resetAllEndpoints() {
    this.endpoints.forEach((endpoint) => {
      endpoint.failures = 0;
      endpoint.isBlacklisted = false;
      endpoint.lastFailure = undefined;
    });
    console.log("Reset all RPC endpoints");
  }

  private getCurrentEndpoint(): RpcEndpoint | null {
    this.clearExpiredBlacklists();

    const availableEndpoints = this.endpoints.filter((ep) => !ep.isBlacklisted);

    if (availableEndpoints.length === 0) {
      console.warn("All RPC endpoints are blacklisted, resetting...");
      this.resetAllEndpoints();
      return this.endpoints[0];
    }

    if (this.currentIndex >= availableEndpoints.length) {
      this.currentIndex = 0;
    }

    return availableEndpoints[this.currentIndex];
  }

  private switchToNextEndpoint() {
    const availableEndpoints = this.endpoints.filter((ep) => !ep.isBlacklisted);
    if (availableEndpoints.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % availableEndpoints.length;
    }
    console.log(`Switched to RPC endpoint: ${this.getCurrentEndpoint()?.url}`);
  }

  private handleFailure(error: unknown): boolean {
    const currentEndpoint = this.getCurrentEndpoint();
    if (!currentEndpoint) return false;

    currentEndpoint.failures += 1;
    currentEndpoint.lastFailure = Date.now();

    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorCode = (error as { code?: number | string })?.code;
    const errorStatus = (error as { status?: number })?.status;

    // Rate limiting detection
    const isRateLimit =
      errorMessage.includes("rate") ||
      errorMessage.includes("429") ||
      errorCode === 429 ||
      errorStatus === 429 ||
      errorMessage.includes("Too many requests") ||
      errorMessage.includes("throttle") ||
      errorMessage.includes("exceeded") ||
      errorMessage.includes("quota");

    // Connection/network errors
    const isConnectionError =
      errorMessage.includes("ECONNRESET") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("network") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("Timeout") ||
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("fetch failed") ||
      errorCode === "ECONNRESET" ||
      errorCode === "ECONNREFUSED" ||
      errorCode === "ETIMEDOUT" ||
      errorCode === "ENOTFOUND";

    // Server errors
    const isServerError =
      errorMessage.includes("500") ||
      errorMessage.includes("502") ||
      errorMessage.includes("503") ||
      errorMessage.includes("504") ||
      (errorStatus !== undefined && errorStatus >= 500);

    const shouldSwitchImmediately =
      isRateLimit || isConnectionError || isServerError;

    if (shouldSwitchImmediately) {
      const reason = isRateLimit
        ? "Rate limited"
        : isConnectionError
          ? "Connection error"
          : "Server error";
      console.warn(`${reason} on ${currentEndpoint.url}, switching...`);

      if (isRateLimit || currentEndpoint.failures >= this.maxFailures) {
        currentEndpoint.isBlacklisted = true;
        console.warn(
          `Blacklisted ${currentEndpoint.url} for ${this.blacklistDuration / 1000}s`
        );
      }

      this.switchToNextEndpoint();
      return true;
    }

    if (currentEndpoint.failures >= this.maxFailures) {
      currentEndpoint.isBlacklisted = true;
      console.warn(
        `Blacklisted ${currentEndpoint.url} after ${this.maxFailures} failures`
      );
      this.switchToNextEndpoint();
      return true;
    }

    console.warn(
      `RPC failure on ${currentEndpoint.url} (attempt ${currentEndpoint.failures}), switching...`
    );
    this.switchToNextEndpoint();
    return true;
  }

  async makeRequest<T>(
    requestFn: (rpcUrl: string) => Promise<T>
  ): Promise<T> {
    const maxRetries = Math.min(this.endpoints.length, 5);
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentEndpoint = this.getCurrentEndpoint();
      if (!currentEndpoint) {
        throw new Error("No RPC endpoint available");
      }

      try {
        console.log(
          `RPC request attempt ${attempt + 1} using ${currentEndpoint.url}`
        );
        const result = await requestFn(currentEndpoint.url);

        // Success - reset failure count
        if (currentEndpoint.failures > 0) {
          currentEndpoint.failures = 0;
        }

        return result;
      } catch (error) {
        console.warn(`RPC request failed on attempt ${attempt + 1}:`, error);
        lastError = error;

        const switched = this.handleFailure(error);

        if (attempt < maxRetries - 1) {
          const waitTime = switched
            ? 200
            : Math.min(500 * Math.pow(2, attempt), 3000);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error(`All ${maxRetries} RPC attempts failed`);
    throw lastError || new Error("All RPC endpoints failed");
  }

  getCurrentUrl(): string {
    return this.getCurrentEndpoint()?.url || "unknown";
  }

  getStatus() {
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
}

// Singleton instance
export const rpcManager = new RpcManager();

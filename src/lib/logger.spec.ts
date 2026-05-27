import { describe, expect, it } from "vitest";

import { env } from "./env";
import { logger } from "./logger";

describe("logger", () => {
    it("logs at info without throwing (bug: a misconfigured transport throws on first write)", () => {
        expect(() => logger.info({ probe: true }, "logger smoke test")).not.toThrow();
    });

    it("logs structured error context without throwing", () => {
        expect(() => logger.error({ err: new Error("boom"), key: "x" }, "structured error")).not.toThrow();
    });

    it("uses the level resolved from env (bug: level wired to a literal instead of env)", () => {
        expect(logger.level).toBe(env.logLevel);
    });
});

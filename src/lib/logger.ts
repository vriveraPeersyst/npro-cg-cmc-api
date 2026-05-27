import pino from "pino";

import { env } from "./env";

/**
 * Structured application logger.
 *
 * Configured WITHOUT a transport/worker-thread (plain JSON to stdout via sonic-boom)
 * so it bundles cleanly into the Next standalone output and never spawns a worker that
 * the Railway container would have to ship. Usage convention (general.md §logging):
 * `logger.error({ err, ...ctx }, "msg")`.
 */
export const logger = pino({ level: env.logLevel });

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    // tsconfigPaths resolves the `@/*` alias declared in tsconfig.json so tests import like the app does.
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        globals: true,
        include: ["src/**/*.{test,spec}.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
        },
    },
});

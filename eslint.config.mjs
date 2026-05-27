import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// `next lint` was removed in Next.js 16, so linting runs through ESLint's flat config directly.
// `eslint-config-next` ships native flat-config arrays (core-web-vitals + typescript) that we spread here,
// and `eslint-plugin-prettier/recommended` wires Prettier as the formatting source of truth (config-prettier
// disables conflicting stylistic rules and reports `prettier/prettier` as an error).
const config = [
    {
        ignores: [".next/", "node_modules/", "next-env.d.ts"],
    },
    ...nextCoreWebVitals,
    ...nextTypescript,
    prettierRecommended,
    {
        rules: {
            "no-console": "warn",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/ban-ts-comment": "off",
        },
    },
];

export default config;

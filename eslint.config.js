import js from "@eslint/js";
import globals from "globals";
import vitest from "@vitest/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

const unusedVarsRule = ["error", { varsIgnorePattern: "^[A-Z_]|^_", argsIgnorePattern: "^_" }];
const commonRules = {
    "no-unused-vars": unusedVarsRule,
    "prefer-const": "error",
    "no-var": "error",
};

export default defineConfig([
    globalIgnores(["**/dist/**", "**/coverage/**", "**/node_modules/**", "charts/**/templates/**"]),

    // controllers + shared modules
    {
        files: [
            "modules/**/*.{js,jsx}",
            "components/management-controller/**/*.{js,jsx}",
            "components/site-controller/**/*.{js,jsx}",
            "tests/**/*.{js,jsx}",
            "*.js",
        ],
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.node,
        },
        rules: {
            ...commonRules,
        },
    },

    // Console
    {
        files: ["components/console/**/*.{js,jsx}"],
        extends: [
            js.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
            parserOptions: {
                ecmaVersion: "latest",
                ecmaFeatures: { jsx: true },
                sourceType: "module",
            },
        },
        rules: {
            ...commonRules,
            "react-hooks/immutability": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/rules-of-hooks": "error",
        },
    },

    // Vitest tests
    {
        files: ["**/*.test.js"],
        extends: [js.configs.recommended, vitest.configs.recommended],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
                ...vitest.environments.env.globals,
            },
        },
        rules: {
            ...commonRules,
        },
    },

    eslintConfigPrettier,
]);

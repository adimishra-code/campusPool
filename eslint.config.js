import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

const unusedVars = ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      // Dev/diagnostic tooling (puppeteer harnesses, visual server) — not app code.
      "client/scripts/**",
      "server/scripts/**"
    ]
  },

  js.configs.recommended,

  // Server — Node ESM.
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": unusedVars,
      "no-console": "off"
    }
  },

  // Server tests — add Jest globals.
  {
    files: ["server/tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest }
    }
  },

  // Client — React 19 + browser.
  {
    files: ["client/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // React 19 / Vite JSX transform — no need to import React in scope.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Literal quotes/apostrophes in JSX text render fine — don't force entities.
      "react/no-unescaped-entities": "off",
      "no-unused-vars": unusedVars
    }
  },

  // Turn off stylistic rules that Prettier owns (keep this last).
  prettier
];

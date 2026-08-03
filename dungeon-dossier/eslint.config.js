// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const engineFiles = ["src/engine/**/*.ts"];

export default defineConfig(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".vite/**",
      "**/*.d.ts",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        __dirname: "readonly",
        console: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,mts}"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: engineFiles,
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message: "The headless engine cannot access browser presentation state.",
        },
        {
          name: "document",
          message: "The headless engine cannot access the DOM.",
        },
        {
          name: "fetch",
          message: "Load data in src/content-io and inject it into the engine.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pixi.js",
              message: "PixiJS belongs to the presentation layer.",
            },
            {
              name: "howler",
              message: "Howler belongs to the audio adapter outside the engine.",
            },
          ],
          patterns: [
            {
              group: ["pixi.js/*", "howler/*"],
              message: "Renderer and audio packages are forbidden in the engine.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "Engine time must come from deterministic input.",
        },
        {
          object: "Math",
          property: "random",
          message: "Use a named run_seed RNG stream from src/engine/rng.",
        },
        {
          object: "globalThis",
          property: "fetch",
          message: "Load data in src/content-io and inject it into the engine.",
        },
        {
          object: "globalThis",
          property: "window",
          message: "The headless engine cannot access browser state.",
        },
        {
          object: "globalThis",
          property: "document",
          message: "The headless engine cannot access the DOM.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(?:^|[^A-Za-z0-9])(?:case_|clm_|ev_|ent_|enc_)/i]",
          message:
            "Content IDs must be loaded from content data, never stored as engine constants.",
        },
        {
          selector:
            "TemplateElement[value.raw=/(?:^|[^A-Za-z0-9])(?:case_|clm_|ev_|ent_|enc_)/i]",
          message:
            "Content IDs must be loaded from content data, never stored as engine constants.",
        },
      ],
    },
  },
);

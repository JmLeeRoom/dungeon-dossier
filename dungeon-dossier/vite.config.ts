import { cp, stat } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { saveWorkbenchAssetsPlugin } from "./tools/workbench-save/index.ts";

const projectRoot = import.meta.dirname;
/**
 * `assets` is deliberately absent. Every PNG, the font and every audio file
 * reach the bundle through `import.meta.glob`, so copying the directory as well
 * shipped each image twice — once hashed under `_app/`, once verbatim under
 * `assets/` — which a fresh build measured at 238 PNGs for 127 source files.
 * `content` and `schemas` stay: those are fetched by URL at runtime.
 */
const staticDirectories = ["content", "schemas"] as const;

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function copyRuntimeData(): Plugin {
  return {
    name: "copy-runtime-data",
    apply: "build",
    async writeBundle(outputOptions) {
      const outputDirectory = resolve(
        projectRoot,
        typeof outputOptions.dir === "string" ? outputOptions.dir : "dist",
      );

      await Promise.all(
        staticDirectories.map(async (directory) => {
          const source = resolve(projectRoot, directory);
          if (!(await isDirectory(source))) {
            return;
          }

          await cp(source, resolve(outputDirectory, directory), {
            recursive: true,
            force: true,
          });
        }),
      );
    },
  };
}

const DEV_CONSOLE_SENTINELS = [
  'DUNGEON DOSSIER · LIVE CONSOLE',
  'TRUTH OVERLAY · DEV BYTES ONLY',
] as const;

function assertDeveloperConsoleTreeShaken(): Plugin {
  return {
    name: 'assert-developer-console-tree-shaken',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      for (const output of Object.values(bundle)) {
        const payload = output.type === 'chunk' ? output.code : String(output.source);
        const leakedSentinel = DEV_CONSOLE_SENTINELS.find((sentinel) => payload.includes(sentinel));
        if (leakedSentinel !== undefined) {
          throw new Error(`Production bundle contains dev-console bytes: ${leakedSentinel}`);
        }
        if (output.type !== 'chunk') continue;
        const leakedModule = Object.keys(output.modules).find((moduleId) =>
          /[/\\]src[/\\]dev[/\\]/u.test(moduleId),
        );
        if (leakedModule !== undefined) {
          throw new Error(`Production bundle contains a dev-console module: ${leakedModule}`);
        }
      }
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  appType: "spa",
  plugins: [
    copyRuntimeData(),
    assertDeveloperConsoleTreeShaken(),
    saveWorkbenchAssetsPlugin(),
  ],
  optimizeDeps: {
    include: ["howler", "pixi.js", "zod"],
    holdUntilCrawlEnd: true,
  },
  server: {
    host: true,
    fs: {
      strict: true,
    },
  },
  build: {
    target: "es2022",
    assetsDir: "_app",
    assetsInlineLimit: 0,
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: resolve(projectRoot, "index.html"),
        assetWorkbench: resolve(projectRoot, "workbench/index.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    sequence: {
      concurrent: false,
    },
  },
});

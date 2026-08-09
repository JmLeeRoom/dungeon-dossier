import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { assetKeyFromFileName, hasRuntimeExtension, isRuntimeAssetKey } from "./assetKey.mjs";
import { readPngMetadata } from "./pngMetadata.mjs";

/**
 * Generates the checked-in runtime asset catalog from what is actually on disk.
 *
 * The catalog is the identity layer: one key, one PNG, one digest. It is
 * generated rather than authored because every field it holds (size, digest,
 * key) is a fact about a file, and hand-copying those into a second place is
 * how they drift.
 *
 *   node tools/assets/build-runtime-catalog.mjs           regenerate
 *   node tools/assets/build-runtime-catalog.mjs --check    fail if stale
 */

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const ASSET_ROOT = path.join(PROJECT_ROOT, "assets");
export const ALLOWLIST_PATH = fileURLToPath(new URL("./nhn-png-allowlist.json", import.meta.url));
export const CATALOG_OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "ui",
  "core",
  "generated",
  "runtimeAssetCatalogData.ts",
);

export const ASSET_BUNDLE_IDS = ["core", "interrogation", "board", "event", "result"];

/**
 * Bundle membership is a coarse route hint, matched most-specific-first. It is
 * declared as an ordered prefix table instead of being inferred from the target
 * directory: `assets/bg/` alone cannot tell the interrogation room from a rest
 * stop, and `assets/ui/` holds board pins next to card seals.
 */
const BUNDLE_RULES = [
  { prefix: "placeholder/", bundles: ["core"] },
  { prefix: "bg/interrogationroom/", bundles: ["interrogation"] },
  { prefix: "bg/event/crazyboard", bundles: ["board"] },
  { prefix: "bg/event/dead", bundles: ["result"] },
  { prefix: "bg/event/", bundles: ["event"] },
  { prefix: "bg/story/", bundles: ["event"] },
  { prefix: "idle/coffee/", bundles: ["interrogation"] },
  { prefix: "idle/", bundles: ["interrogation"] },
  // Title menu plates load before anything else has a route.
  { prefix: "ui/start/", bundles: ["core"] },
  { prefix: "ui/load/", bundles: ["core"] },
  { prefix: "ui/options/", bundles: ["core"] },
  { prefix: "ui/quit/", bundles: ["core"] },
  { prefix: "ui/board/", bundles: ["board"] },
  { prefix: "ui/photo/", bundles: ["board"] },
  { prefix: "ui/pin/", bundles: ["board"] },
  { prefix: "ui/game/", bundles: ["result"] },
  { prefix: "ui/stamp/", bundles: ["result"] },
  { prefix: "ui/card_stamp/", bundles: ["interrogation"] },
  { prefix: "ui/card/", bundles: ["interrogation"] },
  { prefix: "ui/tag/", bundles: ["interrogation"] },
  { prefix: "ui/icon_cp/", bundles: ["interrogation"] },
  { prefix: "ui/icon/", bundles: ["interrogation"] },
  { prefix: "ui/debuff/", bundles: ["interrogation"] },
  { prefix: "ui/system/", bundles: ["interrogation"] },
  { prefix: "dead/", bundles: ["result"] },
  { prefix: "portrait/", bundles: ["interrogation"] },
  { prefix: "card/", bundles: ["interrogation"] },
  { prefix: "ev/", bundles: ["interrogation"] },
  { prefix: "배경/", bundles: ["interrogation"] },
  { prefix: "전경/", bundles: ["interrogation"] },
  { prefix: "아이콘/", bundles: ["interrogation"] },
];

export function bundlesForKey(key) {
  const rule = BUNDLE_RULES.find((candidate) => key.startsWith(candidate.prefix));
  if (rule === undefined) {
    throw new Error(`No bundle rule matches asset key "${key}"; add one to BUNDLE_RULES.`);
  }
  return rule.bundles;
}

async function collectPngFiles(directory, relative = "") {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const nextRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await collectPngFiles(path.join(directory, entry.name), nextRelative)));
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".png") {
      files.push({ fileName: entry.name, runtimePath: `assets/${nextRelative}` });
    }
  }
  return files;
}

export async function buildRuntimeCatalog(options = {}) {
  const assetRoot = options.assetRoot ?? ASSET_ROOT;
  const allowlist = JSON.parse(await readFile(options.allowlistPath ?? ALLOWLIST_PATH, "utf8"));
  const nhnByTarget = new Map(allowlist.entries.map((entry) => [entry.targetPath, entry]));

  const files = await collectPngFiles(assetRoot);
  const problems = [];
  const entries = [];
  const seenKeys = new Map();
  const seenFileNames = new Map();

  for (const file of files) {
    if (!hasRuntimeExtension(file.fileName)) {
      problems.push(`${file.runtimePath}: asset extension must be lower-case .png`);
      continue;
    }
    const buffer = await readFile(path.join(assetRoot, ...file.runtimePath.split("/").slice(1)));
    const metadata = readPngMetadata(buffer);
    const key = assetKeyFromFileName(file.fileName).normalize("NFC");
    if (!isRuntimeAssetKey(key)) {
      problems.push(`${file.runtimePath}: "${key}" is not a valid three-segment runtime key`);
      continue;
    }

    const previousKey = seenKeys.get(key);
    if (previousKey !== undefined) {
      problems.push(`duplicate asset key "${key}" (${previousKey} and ${file.runtimePath})`);
      continue;
    }
    seenKeys.set(key, file.runtimePath);

    // The V3 manifest stores a bare basename, so a basename has to resolve to
    // exactly one catalog entry for that bridge to be unambiguous.
    const previousFileName = seenFileNames.get(file.fileName);
    if (previousFileName !== undefined) {
      problems.push(`duplicate file name "${file.fileName}" (${previousFileName} and ${file.runtimePath})`);
      continue;
    }
    seenFileNames.set(file.fileName, file.runtimePath);

    const nhn = nhnByTarget.get(file.runtimePath);
    if (nhn !== undefined) {
      if (nhn.key !== key) problems.push(`${file.runtimePath}: allowlist key ${nhn.key} != derived ${key}`);
      if (nhn.sha256 !== metadata.sha256) {
        problems.push(
          `${file.runtimePath}: digest ${metadata.sha256} does not match the approved ${nhn.sha256}`,
        );
      }
      if (nhn.width !== metadata.width || nhn.height !== metadata.height) {
        problems.push(
          `${file.runtimePath}: is ${metadata.width}x${metadata.height}, allowlist declares ${nhn.width}x${nhn.height}`,
        );
      }
    }

    entries.push({
      key,
      fileName: file.fileName,
      runtimePath: file.runtimePath,
      width: metadata.width,
      height: metadata.height,
      bundles: bundlesForKey(key),
      provenance: nhn === undefined ? "legacy-placeholder" : "nhn-2026",
      // Approved production art is `active`; the generated placeholders remain
      // available as an explicit fallback rather than being silently deleted.
      status: nhn !== undefined || key === "placeholder/missing/fallback" ? "active" : "legacy-fallback",
      palettePolicy: nhn === undefined ? "strict16" : "approved-production",
      sha256: metadata.sha256,
      // Provenance is the source path; the workbook row is only present for
      // files the naming sheet covered at the time it was written.
      ...(nhn === undefined ? {} : { sourcePath: nhn.sourcePath }),
      ...(nhn?.workbookRow === undefined ? {} : { sourceWorkbookRow: nhn.workbookRow }),
    });
  }

  const seenRuntimePaths = new Set(entries.map((entry) => entry.runtimePath));
  const missingTargets = [...nhnByTarget.keys()].filter((target) => !seenRuntimePaths.has(target));
  for (const target of missingTargets) {
    problems.push(`${target}: approved NHN asset is not present under assets/; run "pnpm assets:import"`);
  }

  entries.sort((left, right) => left.key.localeCompare(right.key, "en"));
  const counts = {
    total: entries.length,
    nhn: entries.filter((entry) => entry.provenance === "nhn-2026").length,
    legacy: entries.filter((entry) => entry.provenance === "legacy-placeholder").length,
  };
  if (counts.nhn !== allowlist.entries.length) {
    problems.push(`catalog holds ${counts.nhn} NHN entries, allowlist declares ${allowlist.entries.length}`);
  }

  return { entries, counts, problems };
}

function serializeCatalog(catalog) {
  const rows = catalog.entries.map((entry) => {
    const fields = [
      `key: ${JSON.stringify(entry.key)}`,
      `fileName: ${JSON.stringify(entry.fileName)}`,
      `runtimePath: ${JSON.stringify(entry.runtimePath)}`,
      `width: ${entry.width}`,
      `height: ${entry.height}`,
      `bundles: [${entry.bundles.map((bundle) => JSON.stringify(bundle)).join(", ")}]`,
      `provenance: ${JSON.stringify(entry.provenance)}`,
      `status: ${JSON.stringify(entry.status)}`,
      `palettePolicy: ${JSON.stringify(entry.palettePolicy)}`,
      `sha256: ${JSON.stringify(entry.sha256)}`,
    ];
    if (entry.sourcePath !== undefined) {
      fields.push(`sourcePath: ${JSON.stringify(entry.sourcePath)}`);
    }
    if (entry.sourceWorkbookRow !== undefined) {
      fields.push(`sourceWorkbookRow: ${entry.sourceWorkbookRow}`);
    }
    return `  {\n${fields.map((field) => `    ${field},`).join("\n")}\n  },`;
  });

  return `// GENERATED FILE - DO NOT EDIT.
// Regenerate with: node tools/assets/build-runtime-catalog.mjs
//
// One row per PNG under assets/. Every value is measured from the file itself,
// so this table is the identity layer the registry, the V3 manifest bridge and
// the palette policy all resolve against.
//
// ${catalog.counts.total} entries = ${catalog.counts.legacy} legacy placeholders + ${catalog.counts.nhn} approved NHN deliverables.

import type { RuntimeAssetCatalogEntry } from '../runtimeAssetCatalogTypes.js';

export const RUNTIME_ASSET_CATALOG_DATA: readonly RuntimeAssetCatalogEntry[] = [
${rows.join("\n")}
];
`;
}

async function main() {
  const check = process.argv.includes("--check");
  const catalog = await buildRuntimeCatalog();
  const serialized = serializeCatalog(catalog);

  if (catalog.problems.length > 0) {
    console.error(`Runtime catalog build failed with ${catalog.problems.length} problem(s):`);
    for (const problem of catalog.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }

  const existing = await readFile(CATALOG_OUTPUT_PATH, "utf8").catch(() => undefined);
  if (check) {
    if (existing !== serialized) {
      console.error(
        `${path.relative(PROJECT_ROOT, CATALOG_OUTPUT_PATH)} is out of date; run "pnpm assets:catalog".`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `Runtime catalog is current (${catalog.counts.total} entries = ${catalog.counts.legacy} legacy + ${catalog.counts.nhn} NHN).`,
    );
    return;
  }

  if (existing !== serialized) await writeFile(CATALOG_OUTPUT_PATH, serialized);
  console.log(
    `Runtime catalog ${existing === serialized ? "unchanged" : "written"} (${catalog.counts.total} entries = ${catalog.counts.legacy} legacy + ${catalog.counts.nhn} NHN).`,
  );
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) {
  await main();
}

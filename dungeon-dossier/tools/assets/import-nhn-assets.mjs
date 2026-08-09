import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { assetKeyFromFileName, hasRuntimeExtension, isNhnAssetKey } from "./assetKey.mjs";
import { PngFormatError, readPngMetadata } from "./pngMetadata.mjs";
import { readXlsxSheet } from "./xlsx.mjs";

/**
 * Deterministic importer for the 72 approved NHN PNG deliverables.
 *
 * Everything it copies is named in `nhn-png-allowlist.json`. It never walks the
 * delivery tree and copies what it finds: the tree also holds 21 working-size
 * exports whose filenames are identical to the adopted ones, 33 PSDs, and a
 * 174-file `ref/` directory. Path allowlisting is the only rule that picks the
 * right member of a same-name pair, so recursive copy is a bug, not a shortcut.
 *
 *   node tools/assets/import-nhn-assets.mjs             sync (idempotent)
 *   node tools/assets/import-nhn-assets.mjs --dry-run   report only, no writes
 *   node tools/assets/import-nhn-assets.mjs --check     fail if targets are stale
 *
 * Sync is the bare-invocation default so a single command leaves the working
 * tree correct, and it is byte-idempotent: a file is only written when its
 * bytes actually differ, so a second run produces an empty diff.
 */

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, "..");
export const ALLOWLIST_PATH = fileURLToPath(new URL("./nhn-png-allowlist.json", import.meta.url));

export const DEFAULT_SOURCE_ROOT = path.join(REPOSITORY_ROOT, "docs", "NHN AI_image");
export const DEFAULT_WORKBOOK_PATH = path.join(
  REPOSITORY_ROOT,
  "docs",
  "NHN AI PNG Asset Naming Convention.xlsx",
);

export const IMPORT_MODES = ["sync", "dry-run", "check"];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

export async function readAllowlist(allowlistPath = ALLOWLIST_PATH) {
  return JSON.parse(await readFile(allowlistPath, "utf8"));
}

async function pathExists(absolutePath) {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hard blocks, checked before any allowlist lookup so a mistake in the
 * allowlist cannot smuggle a reference or working file into the runtime tree.
 */
export function sourcePathViolation(relativeSourcePath, allowlist) {
  const segments = relativeSourcePath.split("/");
  const fileName = segments.at(-1) ?? "";
  const blockedSegment = segments
    .slice(0, -1)
    .find((segment) => allowlist.blockedPathSegments.includes(segment));
  if (blockedSegment !== undefined) {
    return `path contains the blocked directory segment "${blockedSegment}"`;
  }
  const blockedExtension = allowlist.blockedExtensions.find((extension) =>
    fileName.toLowerCase().endsWith(extension),
  );
  if (blockedExtension !== undefined) {
    return `extension "${blockedExtension}" is never a runtime asset`;
  }
  if (!hasRuntimeExtension(fileName)) {
    return `only lower-case "${allowlist.requiredExtension}" files are runtime assets`;
  }
  return undefined;
}

/**
 * Accounts for every PNG in the delivery tree so adopted + excluded is provably
 * the whole population. `Characters/` is walked recursively because its 21
 * excluded files are the oversized root export and the `PSD/` working exports,
 * which share filenames with the adopted `iloveimg-resized/` set; `background/`
 * and `UI/` are flat.
 */
async function collectSourcePngs(sourceRoot, allowlist) {
  const adopted = new Set(allowlist.entries.map((entry) => entry.sourcePath));
  const scanned = [];

  const walk = async (absolute, relative, recursive) => {
    const entries = (await readdir(absolute, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const nextRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive) await walk(path.join(absolute, entry.name), nextRelative, recursive);
        continue;
      }
      if (!entry.isFile() || !hasRuntimeExtension(entry.name)) continue;
      scanned.push({
        relativeSourcePath: `${allowlist.sourceRoot}/${nextRelative}`,
        absolutePath: path.join(absolute, entry.name),
      });
    }
  };

  for (const tree of allowlist.scannedSourceTrees) {
    const absolute = path.join(sourceRoot, ...tree.directory.split("/"));
    if (!(await pathExists(absolute))) {
      throw new Error(`Source directory is missing: ${toPosix(path.relative(REPOSITORY_ROOT, absolute))}`);
    }
    await walk(absolute, tree.directory, tree.recursive === true);
  }

  return {
    scanned,
    adoptedCount: scanned.filter((file) => adopted.has(file.relativeSourcePath)).length,
    excluded: scanned
      .filter((file) => !adopted.has(file.relativeSourcePath))
      .map((file) => file.relativeSourcePath),
  };
}

/**
 * Enumerates everything inside the three delivery folders that must never reach
 * `assets/`. Blocked directories are recorded *and* descended into, so the
 * report states how many PSDs actually exist rather than how many happened to
 * sit outside a blocked folder. `ref/` is a sibling of these folders and is
 * handled by the separate top-level check, not counted here.
 */
async function collectForbiddenSources(sourceRoot, allowlist) {
  const found = [];
  const walk = async (directory, relative) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const nextRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (allowlist.blockedPathSegments.includes(entry.name)) {
          found.push({ path: nextRelative, reason: "blocked directory" });
        }
        await walk(path.join(directory, entry.name), nextRelative);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (allowlist.blockedExtensions.includes(extension)) {
        found.push({ path: nextRelative, reason: `blocked extension ${extension}` });
      }
    }
  };
  for (const tree of allowlist.scannedSourceTrees) {
    await walk(path.join(sourceRoot, ...tree.directory.split("/")), tree.directory);
  }
  return found;
}

/** Structural invariants of the allowlist itself, independent of any file. */
export function validateAllowlist(allowlist) {
  const problems = [];
  const seen = { key: new Map(), target: new Map(), caseFoldedTarget: new Map(), source: new Map() };

  if (allowlist.entries.length !== allowlist.expectedSourcePngCount.adopted) {
    problems.push(
      `allowlist declares ${allowlist.expectedSourcePngCount.adopted} adopted files but lists ${allowlist.entries.length}`,
    );
  }

  const perCategory = { characters: 0, background: 0, ui: 0 };
  for (const entry of allowlist.entries) {
    const fileName = entry.targetPath.split("/").at(-1);
    const sourceFileName = entry.sourcePath.split("/").at(-1);

    if (sourceFileName !== fileName) {
      problems.push(`${entry.targetPath}: filename must be preserved from ${entry.sourcePath}`);
    }
    const violation = sourcePathViolation(entry.sourcePath, allowlist);
    if (violation !== undefined) problems.push(`${entry.sourcePath}: ${violation}`);
    if (!entry.targetPath.startsWith("assets/")) {
      problems.push(`${entry.targetPath}: target must live under assets/`);
    }
    if (!hasRuntimeExtension(entry.targetPath)) {
      problems.push(`${entry.targetPath}: target must end in a lower-case .png`);
    }

    let derivedKey;
    try {
      derivedKey = assetKeyFromFileName(fileName);
    } catch (error) {
      problems.push(`${entry.targetPath}: ${error.message}`);
      continue;
    }
    if (derivedKey !== entry.key) {
      problems.push(`${entry.targetPath}: key must be ${derivedKey}, allowlist says ${entry.key}`);
    }
    if (!isNhnAssetKey(entry.key)) {
      problems.push(`${entry.key}: NHN keys must be lower-case ASCII in all three segments`);
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      problems.push(`${entry.targetPath}: sha256 must be 64 lower-case hex characters`);
    }

    for (const [field, value] of [
      ["key", entry.key],
      ["target", entry.targetPath],
      ["caseFoldedTarget", entry.targetPath.toLowerCase()],
      ["source", entry.sourcePath],
    ]) {
      const previous = seen[field].get(value);
      if (previous !== undefined) problems.push(`duplicate ${field} "${value}" (${previous} and ${entry.targetPath})`);
      else seen[field].set(value, entry.targetPath);
    }

    if (entry.sourcePath.includes("/Characters/")) perCategory.characters += 1;
    else if (entry.sourcePath.includes("/background/")) perCategory.background += 1;
    else if (entry.sourcePath.includes("/UI/")) perCategory.ui += 1;
  }

  for (const [category, expected] of Object.entries(allowlist.expectedCategoryCounts)) {
    if (perCategory[category] !== expected) {
      problems.push(`category ${category}: expected ${expected} entries, allowlist has ${perCategory[category]}`);
    }
  }

  return problems;
}

/**
 * The workbook is the art team's naming record, not the key source: the
 * filename stem is. Four cells decompose differently (two seals that belong to
 * a `card_stamp` name, two numeric cells that lost their zero padding), and
 * each is declared in `workbookKeyNormalizations` rather than silently
 * accepted, so an undeclared future mismatch still fails.
 */
/**
 * Checks the entries the naming workbook actually covers.
 *
 * The workbook is a snapshot of one delivery. Later deliveries add files before
 * the sheet is revised, so an entry without a `workbookRow` is approved by the
 * allowlist alone and is not a parity failure — only a row that disagrees with
 * its filename is.
 */
export function compareWorkbook(rows, allowlist) {
  const problems = [];
  const [firstRow, lastRow] = allowlist.workbook.runtimeRows;
  const runtimeRows = rows.filter((row) => row.row >= firstRow && row.row <= lastRow);
  const normalizations = new Map(
    allowlist.workbookKeyNormalizations.map((item) => [item.workbookRow, item]),
  );
  const workbookEntries = allowlist.entries.filter((entry) => entry.workbookRow !== undefined);

  if (runtimeRows.length !== workbookEntries.length) {
    problems.push(
      `workbook rows ${firstRow}-${lastRow} hold ${runtimeRows.length} entries, allowlist has ${workbookEntries.length} rowed entries`,
    );
  }

  const entriesByRow = new Map(workbookEntries.map((entry) => [entry.workbookRow, entry]));
  let matched = 0;

  for (const row of runtimeRows) {
    const entry = entriesByRow.get(row.row);
    if (entry === undefined) {
      problems.push(`workbook row ${row.row} (${row.B ?? "?"}) has no allowlist entry`);
      continue;
    }
    const fileName = entry.targetPath.split("/").at(-1);
    if (row.B !== fileName) {
      problems.push(`workbook row ${row.row}: filename "${row.B}" does not match "${fileName}"`);
      continue;
    }
    const workbookKey = `${row.C ?? ""}/${row.D ?? ""}/${row.E ?? ""}`;
    if (workbookKey === entry.key) {
      matched += 1;
      continue;
    }
    const normalization = normalizations.get(row.row);
    if (normalization === undefined) {
      problems.push(
        `workbook row ${row.row} (${fileName}): decomposes to "${workbookKey}" but the filename yields "${entry.key}"; add a declared normalization or fix the workbook`,
      );
      continue;
    }
    if (normalization.canonical.replaceAll(" ", "") !== entry.key) {
      problems.push(
        `workbook row ${row.row}: declared normalization targets "${normalization.canonical}" but the key is "${entry.key}"`,
      );
      continue;
    }
    matched += 1;
  }

  const referenceRows = rows.filter(
    (row) => row.row >= allowlist.workbook.referenceRows[0] && row.row <= allowlist.workbook.referenceRows[1],
  );
  const leakedReference = referenceRows.find((row) =>
    allowlist.entries.some((entry) => entry.targetPath.endsWith(`/${row.B}`)),
  );
  if (leakedReference !== undefined) {
    problems.push(`workbook reference row ${leakedReference.row} (${leakedReference.B}) was adopted for runtime`);
  }

  return {
    matched,
    total: workbookEntries.length,
    unrowed: allowlist.entries.length - workbookEntries.length,
    referenceRows: referenceRows.length,
    problems,
  };
}

async function readTarget(projectRoot, entry) {
  const absolute = path.join(projectRoot, ...entry.targetPath.split("/"));
  if (!(await pathExists(absolute))) return { absolute, state: "missing" };
  const buffer = await readFile(absolute);
  try {
    const metadata = readPngMetadata(buffer);
    return { absolute, buffer, metadata, state: metadata.sha256 === entry.sha256 ? "current" : "stale" };
  } catch (error) {
    return { absolute, buffer, state: "invalid", message: error.message };
  }
}

export async function importNhnAssets(options = {}) {
  const mode = options.mode ?? "sync";
  if (!IMPORT_MODES.includes(mode)) throw new Error(`Unknown import mode: ${mode}`);
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const sourceRoot = options.sourceRoot ?? DEFAULT_SOURCE_ROOT;
  const workbookPath = options.workbookPath ?? DEFAULT_WORKBOOK_PATH;
  const allowlist = options.allowlist ?? (await readAllowlist(options.allowlistPath));

  const result = {
    /** Set at the end; declared here so the shape is complete from the start. */
    ok: false,
    referenceDirectoryPresent: false,
    mode,
    sourceRoot: toPosix(path.relative(REPOSITORY_ROOT, sourceRoot)) || ".",
    sourceAvailable: await pathExists(sourceRoot),
    workbookAvailable: await pathExists(workbookPath),
    allowlistEntries: allowlist.entries.length,
    scannedSourcePngs: 0,
    adopted: 0,
    excluded: [],
    forbidden: [],
    workbook: undefined,
    written: [],
    unchanged: [],
    stale: [],
    missing: [],
    problems: validateAllowlist(allowlist),
  };

  if (result.sourceAvailable) {
    const inventory = await collectSourcePngs(sourceRoot, allowlist);
    result.scannedSourcePngs = inventory.scanned.length;
    result.adopted = inventory.adoptedCount;
    result.excluded = inventory.excluded;
    result.forbidden = await collectForbiddenSources(sourceRoot, allowlist);

    const expected = allowlist.expectedSourcePngCount;
    if (inventory.scanned.length !== expected.totalInScannedTree) {
      result.problems.push(
        `scanned tree holds ${inventory.scanned.length} PNGs, expected ${expected.totalInScannedTree}`,
      );
    }
    if (inventory.adoptedCount !== expected.adopted) {
      result.problems.push(`adopted ${inventory.adoptedCount} of the expected ${expected.adopted} source files`);
    }
    if (inventory.excluded.length !== expected.excludedInScannedTree) {
      result.problems.push(
        `excluded ${inventory.excluded.length} PNGs, expected ${expected.excludedInScannedTree}`,
      );
    }

    const psdCount = result.forbidden.filter((item) => item.reason.endsWith(".psd")).length;
    if (psdCount !== allowlist.expectedForbiddenSourceCounts.psdFiles) {
      result.problems.push(
        `found ${psdCount} PSD files in the scanned tree, expected ${allowlist.expectedForbiddenSourceCounts.psdFiles}`,
      );
    }
    for (const directory of allowlist.expectedForbiddenSourceCounts.blockedDirectories) {
      if (!result.forbidden.some((item) => item.path === directory)) {
        result.problems.push(`expected blocked directory "${directory}" was not found in the source tree`);
      }
    }
    // `ref/` is reference-only art: it is a sibling of the delivery folders and
    // must never appear in a scanned tree, an allowlist entry, or a target.
    const referenceDirectory = allowlist.expectedForbiddenSourceCounts.referenceDirectory;
    result.referenceDirectoryPresent = await pathExists(path.join(sourceRoot, referenceDirectory));
    const leakedReference = allowlist.entries.find((entry) =>
      entry.sourcePath.split("/").includes(referenceDirectory),
    );
    if (leakedReference !== undefined) {
      result.problems.push(`${leakedReference.sourcePath}: reference art is never a runtime asset`);
    }

    if (result.workbookAvailable) {
      result.workbook = compareWorkbook(
        await readXlsxSheet(workbookPath),
        allowlist,
      );
      result.problems.push(...result.workbook.problems);
    }
  }

  for (const entry of allowlist.entries) {
    const absoluteSource = path.join(REPOSITORY_ROOT, ...entry.sourcePath.split("/"));
    let sourceBuffer;

    if (result.sourceAvailable) {
      const violation = sourcePathViolation(entry.sourcePath, allowlist);
      if (violation !== undefined) {
        result.problems.push(`${entry.sourcePath}: ${violation}`);
        continue;
      }
      if (!(await pathExists(absoluteSource))) {
        result.problems.push(`${entry.sourcePath}: source file is missing`);
        continue;
      }
      sourceBuffer = await readFile(absoluteSource);
      let metadata;
      try {
        metadata = readPngMetadata(sourceBuffer);
      } catch (error) {
        const detail = error instanceof PngFormatError ? error.message : String(error);
        result.problems.push(`${entry.sourcePath}: ${detail}`);
        continue;
      }
      if (metadata.width !== entry.width || metadata.height !== entry.height) {
        result.problems.push(
          `${entry.sourcePath}: is ${metadata.width}x${metadata.height}, allowlist declares ${entry.width}x${entry.height}`,
        );
        continue;
      }
      if (metadata.sha256 !== entry.sha256) {
        result.problems.push(
          `${entry.sourcePath}: sha256 ${metadata.sha256} does not match the approved ${entry.sha256}; re-approve the art before importing`,
        );
        continue;
      }
    }

    const target = await readTarget(projectRoot, entry);
    if (target.state === "current") {
      result.unchanged.push(entry.targetPath);
      continue;
    }
    if (target.state === "missing") result.missing.push(entry.targetPath);
    else result.stale.push(entry.targetPath);

    if (mode !== "sync") continue;
    if (sourceBuffer === undefined) {
      result.problems.push(
        `${entry.targetPath}: target is ${target.state} and the source tree is unavailable at ${result.sourceRoot}`,
      );
      continue;
    }
    await mkdir(path.dirname(target.absolute), { recursive: true });
    await writeFile(target.absolute, sourceBuffer);
    result.written.push(entry.targetPath);
  }

  if (mode === "check" && (result.stale.length > 0 || result.missing.length > 0)) {
    result.problems.push(
      `${result.stale.length + result.missing.length} target(s) are out of date; run "pnpm assets:import"`,
    );
  }
  if (mode === "sync") {
    const unresolved = [...result.stale, ...result.missing].filter(
      (targetPath) => !result.written.includes(targetPath),
    );
    if (unresolved.length > 0) {
      result.problems.push(`${unresolved.length} target(s) could not be synchronised`);
    }
  }

  result.ok = result.problems.length === 0;
  return result;
}

function report(result) {
  const lines = [
    `NHN asset import (${result.mode})`,
    `  source tree      ${result.sourceAvailable ? result.sourceRoot : `${result.sourceRoot} [unavailable - verifying committed targets only]`}`,
  ];
  if (result.sourceAvailable) {
    lines.push(
      `  source PNGs      ${result.scannedSourcePngs} = ${result.adopted} adopted + ${result.excluded.length} excluded`,
      `  blocked in tree  ${result.forbidden.length} ref/PSD path(s) never considered`,
    );
  }
  if (result.workbook !== undefined) {
    lines.push(
      `  workbook parity  ${result.workbook.matched}/${result.workbook.total} runtime rows` +
        `, ${result.workbook.unrowed} approved after the sheet` +
        `, ${result.workbook.referenceRows} reference rows excluded`,
    );
  }
  lines.push(
    `  targets          ${result.unchanged.length} unchanged, ${result.written.length} written, ${result.missing.length} missing, ${result.stale.length} stale`,
  );
  return lines.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv.includes("--check") ? "check" : argv.includes("--dry-run") ? "dry-run" : "sync";
  const sourceArgument = argv.find((argument) => argument.startsWith("--source="));
  const sourceRoot =
    sourceArgument !== undefined
      ? path.resolve(sourceArgument.slice("--source=".length))
      : (process.env.NHN_ASSET_SOURCE_ROOT ?? DEFAULT_SOURCE_ROOT);

  const result = await importNhnAssets({ mode, sourceRoot });
  console.log(report(result));

  if (result.problems.length > 0) {
    console.error(`\n${result.problems.length} problem(s):`);
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nOK");
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) {
  await main();
}

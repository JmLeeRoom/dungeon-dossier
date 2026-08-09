import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import pngjs from "pngjs";

import {
  MAX_OPAQUE_RGBA_COLOURS,
  countVisibleRgbaColours,
  evaluatePalette,
  toRuntimePath,
} from "../assets/palettePolicy.mjs";

const { PNG } = pngjs;

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_ASSET_ROOT = path.join(REPOSITORY_ROOT, "assets");
export { MAX_OPAQUE_RGBA_COLOURS, countVisibleRgbaColours };

function relativeDisplayPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

async function collectPngFiles(directory) {
  const files = [];
  const invalidExtensions = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectPngFiles(absolutePath);
      files.push(...nested.files);
      invalidExtensions.push(...nested.invalidExtensions);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".png") {
      if (path.extname(entry.name) === ".png") files.push(absolutePath);
      else invalidExtensions.push(absolutePath);
    }
  }

  return { files, invalidExtensions };
}

export async function checkPalettes(assetRoot = DEFAULT_ASSET_ROOT) {
  try {
    const rootStats = await stat(assetRoot);
    if (!rootStats.isDirectory()) {
      return {
        checkedFiles: 0,
        problems: [
          {
            relativePath: relativeDisplayPath(REPOSITORY_ROOT, assetRoot),
            message: "assets path exists but is not a directory",
          },
        ],
      };
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { checkedFiles: 0, problems: [] };
    }
    throw error;
  }

  const { files, invalidExtensions } = await collectPngFiles(assetRoot);
  const problems = invalidExtensions.map((absolutePath) => ({
    relativePath: relativeDisplayPath(assetRoot, absolutePath),
    message: "asset extension must be lower-case .png",
  }));
  const byPolicy = { strict16: 0, "approved-production": 0 };

  for (const absolutePath of files) {
    const relativePath = relativeDisplayPath(assetRoot, absolutePath);
    try {
      const buffer = await readFile(absolutePath);
      const result = await evaluatePalette({
        runtimePath: toRuntimePath(relativePath),
        buffer,
        png: PNG.sync.read(buffer),
      });
      byPolicy[result.policy] += 1;
      if (result.problem !== undefined) {
        problems.push({ relativePath, message: result.problem });
      }
    } catch (error) {
      problems.push({
        relativePath,
        message: `invalid PNG: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { checkedFiles: files.length, byPolicy, problems };
}

async function main() {
  const result = await checkPalettes();

  const counts = result.byPolicy ?? { strict16: result.checkedFiles, "approved-production": 0 };
  const summary =
    `${result.checkedFiles} PNG file(s): ` +
    `${counts.strict16} at strict16, ` +
    `${counts["approved-production"]} approved production art verified by digest`;

  if (result.problems.length === 0) {
    console.log(`Palette check passed (${summary}).`);
    return;
  }
  console.error(`Checked ${summary}.`);

  console.error(`Palette check failed with ${result.problems.length} problem(s):`);
  for (const problem of result.problems) {
    console.error(`- ${problem.relativePath}: ${problem.message}`);
  }
  process.exitCode = 1;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) {
  await main();
}

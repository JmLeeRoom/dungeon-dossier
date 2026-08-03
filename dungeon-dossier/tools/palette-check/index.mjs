import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import pngjs from "pngjs";

const { PNG } = pngjs;

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_ASSET_ROOT = path.join(REPOSITORY_ROOT, "assets");
export const MAX_OPAQUE_RGBA_COLOURS = 16;

function relativeDisplayPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

async function collectPngFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPngFiles(absolutePath)));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".png") {
      files.push(absolutePath);
    }
  }

  return files;
}

export function countVisibleRgbaColours(png) {
  const colours = new Set();

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha === 0) {
      continue;
    }

    const rgba =
      ((png.data[offset] << 24) |
        (png.data[offset + 1] << 16) |
        (png.data[offset + 2] << 8) |
        alpha) >>>
      0;
    colours.add(rgba);
  }

  return colours.size;
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

  const files = await collectPngFiles(assetRoot);
  const problems = [];

  for (const absolutePath of files) {
    const relativePath = relativeDisplayPath(assetRoot, absolutePath);
    try {
      const png = PNG.sync.read(await readFile(absolutePath));
      const colourCount = countVisibleRgbaColours(png);
      if (colourCount > MAX_OPAQUE_RGBA_COLOURS) {
        problems.push({
          relativePath,
          message: `${colourCount} visible RGBA colours (maximum ${MAX_OPAQUE_RGBA_COLOURS})`,
        });
      }
    } catch (error) {
      problems.push({
        relativePath,
        message: `invalid PNG: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { checkedFiles: files.length, problems };
}

async function main() {
  const result = await checkPalettes();

  if (result.problems.length === 0) {
    console.log(`Palette check passed (${result.checkedFiles} PNG file(s) checked).`);
    return;
  }

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

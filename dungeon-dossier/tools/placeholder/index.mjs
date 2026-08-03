import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import pngjs from "pngjs";

const { PNG } = pngjs;

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL("./placeholders.json", import.meta.url),
);

const MIN_DIMENSION = 8;
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_777_216;
const FILE_SEGMENT_PATTERN = /^[\p{L}\p{N}-]+$/u;
const FILE_NAME_PATTERN = /^[\p{L}\p{N}-]+(?:_[\p{L}\p{N}-]+)*$/u;
const THEMES = Object.freeze({
  neutral: Object.freeze({
    background: [20, 22, 29, 255],
    backgroundAlt: [27, 30, 40, 255],
    border: [111, 119, 137, 255],
    shadow: [7, 8, 12, 255],
    silhouette: [57, 62, 76, 255],
    highlight: [79, 86, 103, 255],
    plate: [36, 39, 48, 255],
    text: [225, 218, 190, 255],
  }),
  cyan: Object.freeze({
    background: [8, 27, 32, 255],
    backgroundAlt: [11, 38, 45, 255],
    border: [73, 145, 151, 255],
    shadow: [3, 12, 15, 255],
    silhouette: [25, 66, 72, 255],
    highlight: [51, 103, 108, 255],
    plate: [13, 48, 54, 255],
    text: [191, 231, 220, 255],
  }),
  sepia: Object.freeze({
    background: [38, 29, 18, 255],
    backgroundAlt: [50, 38, 23, 255],
    border: [143, 112, 67, 255],
    shadow: [16, 11, 7, 255],
    silhouette: [78, 59, 35, 255],
    highlight: [111, 84, 48, 255],
    plate: [60, 43, 25, 255],
    text: [235, 211, 158, 255],
  }),
  magenta: Object.freeze({
    background: [34, 13, 32, 255],
    backgroundAlt: [47, 17, 44, 255],
    border: [149, 70, 135, 255],
    shadow: [14, 5, 13, 255],
    silhouette: [76, 31, 70, 255],
    highlight: [109, 47, 98, 255],
    plate: [57, 22, 52, 255],
    text: [238, 194, 226, 255],
  }),
});

// Readable 5x7 bitmap glyphs. Values are five-bit rows, top to bottom.
const FONT_5X7 = Object.freeze({
  " ": [0, 0, 0, 0, 0, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "-": [0, 0, 0, 31, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 6, 6],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 16, 30, 1, 1, 30],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
  ":": [0, 6, 6, 0, 6, 6, 0],
  "?": [14, 17, 1, 2, 4, 0, 4],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 25, 21, 19, 19, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  _: [0, 0, 0, 0, 0, 0, 31],
});

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function parseDimension(value, label) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_DIMENSION ||
    parsed > MAX_DIMENSION
  ) {
    throw new RangeError(
      `${label} must be an integer from ${MIN_DIMENSION} through ${MAX_DIMENSION}.`,
    );
  }
  return parsed;
}

function validateFilenameParts({ category, name, state }) {
  if (typeof category !== "string" || !FILE_SEGMENT_PATTERN.test(category)) {
    throw new TypeError("category must be non-empty and cannot contain '_' or path punctuation.");
  }
  if (typeof name !== "string" || !FILE_NAME_PATTERN.test(name)) {
    throw new TypeError("name must contain non-empty filename segments separated by optional '_'.");
  }
  if (typeof state !== "string" || !FILE_SEGMENT_PATTERN.test(state)) {
    throw new TypeError("state must be non-empty and cannot contain '_' or path punctuation.");
  }
}

export function buildPlaceholderFilename(specification) {
  validateFilenameParts(specification);
  return `${specification.category}_${specification.name}_${specification.state}.png`;
}

export function normalizePlaceholderSpec(specification) {
  assertPlainObject(specification, "placeholder specification");
  validateFilenameParts(specification);

  const width = parseDimension(specification.width, "width");
  const height = parseDimension(specification.height, "height");
  if (width * height > MAX_PIXELS) {
    throw new RangeError(`placeholder area cannot exceed ${MAX_PIXELS} pixels.`);
  }

  const theme = specification.theme ?? "neutral";
  if (typeof theme !== "string" || !Object.hasOwn(THEMES, theme)) {
    throw new TypeError(
      `theme must be one of: ${Object.keys(THEMES).join(", ")}.`,
    );
  }

  const directory = specification.directory ?? "";
  if (typeof directory !== "string" || path.isAbsolute(directory)) {
    throw new TypeError("directory must be a relative path inside the output directory.");
  }

  const label = specification.label ?? specification.name;
  if (typeof label !== "string") {
    throw new TypeError("label must be a string when supplied.");
  }

  return {
    category: specification.category,
    name: specification.name,
    state: specification.state,
    width,
    height,
    label,
    theme,
    directory,
  };
}

function setPixel(png, x, y, colour) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const offset = (png.width * y + x) * 4;
  png.data[offset] = colour[0];
  png.data[offset + 1] = colour[1];
  png.data[offset + 2] = colour[2];
  png.data[offset + 3] = colour[3];
}

function fillRectangle(png, left, top, width, height, colour) {
  const startX = Math.max(0, left);
  const startY = Math.max(0, top);
  const endX = Math.min(png.width, left + width);
  const endY = Math.min(png.height, top + height);

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) setPixel(png, x, y, colour);
  }
}

function fillEllipse(png, centreX, centreY, radiusX, radiusY, colour) {
  const radiusXSquared = radiusX * radiusX;
  const radiusYSquared = radiusY * radiusY;
  const threshold = radiusXSquared * radiusYSquared;

  for (let y = centreY - radiusY; y <= centreY + radiusY; y += 1) {
    for (let x = centreX - radiusX; x <= centreX + radiusX; x += 1) {
      const dx = x - centreX;
      const dy = y - centreY;
      if (
        dx * dx * radiusYSquared + dy * dy * radiusXSquared <=
        threshold
      ) {
        setPixel(png, x, y, colour);
      }
    }
  }
}

function drawBackground(png, palette) {
  fillRectangle(png, 0, 0, png.width, png.height, palette.background);
  for (let y = 1; y < png.height - 1; y += 1) {
    for (let x = 1; x < png.width - 1; x += 1) {
      if ((x + y * 3) % 11 === 0) setPixel(png, x, y, palette.backgroundAlt);
    }
  }

  fillRectangle(png, 0, 0, png.width, 1, palette.border);
  fillRectangle(png, 0, png.height - 1, png.width, 1, palette.border);
  fillRectangle(png, 0, 0, 1, png.height, palette.border);
  fillRectangle(png, png.width - 1, 0, 1, png.height, palette.border);
}

function drawSilhouette(png, palette, plateTop) {
  const usableHeight = Math.max(1, plateTop - 4);
  const centreX = Math.floor(png.width / 2);
  const headRadiusX = Math.max(2, Math.min(Math.floor(png.width / 8), Math.floor(usableHeight / 7)));
  const headRadiusY = Math.max(2, Math.floor(headRadiusX * 1.12));
  const headY = Math.max(headRadiusY + 2, Math.floor(usableHeight * 0.33));

  fillEllipse(
    png,
    centreX + Math.max(1, Math.floor(headRadiusX / 4)),
    headY + 1,
    headRadiusX,
    headRadiusY,
    palette.shadow,
  );
  fillEllipse(png, centreX, headY, headRadiusX, headRadiusY, palette.silhouette);

  const bodyTop = headY + headRadiusY - 1;
  const bodyBottom = Math.max(bodyTop + 1, plateTop - 3);
  const shoulderWidth = Math.min(
    Math.max(headRadiusX * 3, 5),
    Math.max(5, png.width - 6),
  );
  for (let y = bodyTop; y < bodyBottom; y += 1) {
    const progress = (y - bodyTop) / Math.max(1, bodyBottom - bodyTop - 1);
    const halfWidth = Math.max(
      headRadiusX,
      Math.floor(headRadiusX + progress * (shoulderWidth / 2 - headRadiusX)),
    );
    fillRectangle(
      png,
      centreX - halfWidth,
      y,
      halfWidth * 2 + 1,
      1,
      palette.silhouette,
    );
  }

  const highlightWidth = Math.max(1, Math.floor(headRadiusX / 3));
  fillRectangle(
    png,
    centreX - Math.floor(headRadiusX / 2),
    headY - Math.floor(headRadiusY / 2),
    highlightWidth,
    Math.max(1, Math.floor(headRadiusY / 2)),
    palette.highlight,
  );
}

function asciiLabel(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/gu, "?")
    .toUpperCase()
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || "MISSING";
}

function fitLabel(label, availableWidth, availableHeight) {
  const maxScaleByHeight = Math.max(1, Math.floor(availableHeight / 7));
  const naturalColumns = Math.max(1, label.length * 6 - 1);
  let scale = Math.min(
    maxScaleByHeight,
    Math.max(1, Math.floor(availableWidth / naturalColumns)),
  );
  let fitted = label;

  const maxCharacters = Math.max(1, Math.floor((availableWidth / scale + 1) / 6));
  if (fitted.length > maxCharacters) fitted = fitted.slice(0, maxCharacters);

  const fittedColumns = Math.max(1, fitted.length * 6 - 1);
  if (fittedColumns * scale > availableWidth) scale = 1;
  return { label: fitted, scale };
}

function drawGlyph(png, character, left, top, scale, colour) {
  const rows = FONT_5X7[character] ?? FONT_5X7["?"];
  for (let row = 0; row < rows.length; row += 1) {
    const bits = rows[row];
    for (let column = 0; column < 5; column += 1) {
      if ((bits & (1 << (4 - column))) !== 0) {
        fillRectangle(
          png,
          left + column * scale,
          top + row * scale,
          scale,
          scale,
          colour,
        );
      }
    }
  }
}

function drawNameplate(png, palette, label, plateTop) {
  fillRectangle(png, 1, plateTop, png.width - 2, png.height - plateTop - 1, palette.plate);
  fillRectangle(png, 1, plateTop, png.width - 2, 1, palette.border);

  const availableWidth = Math.max(1, png.width - 6);
  const availableHeight = Math.max(1, png.height - plateTop - 4);
  const fitted = fitLabel(asciiLabel(label), availableWidth, availableHeight);
  const textWidth = Math.max(1, fitted.label.length * 6 - 1) * fitted.scale;
  const textHeight = 7 * fitted.scale;
  const left = Math.max(2, Math.floor((png.width - textWidth) / 2));
  const top = Math.max(plateTop + 2, plateTop + Math.floor((png.height - plateTop - textHeight) / 2));

  for (let index = 0; index < fitted.label.length; index += 1) {
    drawGlyph(
      png,
      fitted.label[index],
      left + index * 6 * fitted.scale,
      top,
      fitted.scale,
      palette.text,
    );
  }
}

export function createPlaceholderPng(specification) {
  const spec = normalizePlaceholderSpec(specification);
  const palette = THEMES[spec.theme];
  const png = new PNG({
    width: spec.width,
    height: spec.height,
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
  });

  const plateHeight = Math.min(
    spec.height - 2,
    Math.max(10, Math.floor(spec.height * 0.18)),
  );
  const plateTop = spec.height - plateHeight - 1;
  drawBackground(png, palette);
  drawSilhouette(png, palette, plateTop);
  drawNameplate(png, palette, spec.label, plateTop);

  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    bitDepth: 8,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
}

function resolveOutputSubdirectory(outputDirectory, relativeDirectory) {
  const root = path.resolve(outputDirectory);
  const destination = path.resolve(root, relativeDirectory);
  const relative = path.relative(root, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`directory escapes the output root: ${relativeDirectory}`);
  }
  return destination;
}

export async function generatePlaceholders({
  outputDirectory,
  assets,
  force = false,
}) {
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
    throw new TypeError("outputDirectory must be a non-empty path.");
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new TypeError("assets must be a non-empty array.");
  }

  const normalizedAssets = assets.map(normalizePlaceholderSpec);
  const targets = new Set();
  const plan = normalizedAssets.map((asset) => {
    const directory = resolveOutputSubdirectory(outputDirectory, asset.directory);
    const filePath = path.join(directory, buildPlaceholderFilename(asset));
    const normalizedTarget = path.normalize(filePath);
    if (targets.has(normalizedTarget)) {
      throw new Error(`duplicate placeholder target: ${normalizedTarget}`);
    }
    targets.add(normalizedTarget);
    return { asset, directory, filePath };
  });

  const generated = [];
  const skipped = [];
  for (const item of plan) {
    await mkdir(item.directory, { recursive: true });
    const buffer = createPlaceholderPng(item.asset);
    try {
      await writeFile(item.filePath, buffer, force ? undefined : { flag: "wx" });
      generated.push(item.filePath);
    } catch (error) {
      if (!force && error?.code === "EEXIST") {
        skipped.push(item.filePath);
        continue;
      }
      throw error;
    }
  }

  return { generated, skipped };
}

export async function readPlaceholderConfig(configPath) {
  const absolutePath = path.resolve(configPath);
  const parsed = JSON.parse(await readFile(absolutePath, "utf8"));
  assertPlainObject(parsed, "placeholder config");
  if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) {
    throw new TypeError("placeholder config assets must be a non-empty array.");
  }
  if (parsed.outputDirectory !== undefined && typeof parsed.outputDirectory !== "string") {
    throw new TypeError("placeholder config outputDirectory must be a string.");
  }

  return {
    configPath: absolutePath,
    outputDirectory: parsed.outputDirectory,
    assets: parsed.assets.map(normalizePlaceholderSpec),
  };
}

export function parseCliArguments(argumentsList) {
  const options = { force: false, help: false };
  const valueOptions = new Set([
    "config",
    "output",
    "category",
    "name",
    "state",
    "width",
    "height",
    "label",
    "theme",
    "directory",
  ]);

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`unexpected argument: ${argument}`);

    const option = argument.slice(2);
    if (!valueOptions.has(option)) throw new Error(`unknown option: ${argument}`);
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    options[option] = value;
    index += 1;
  }

  return options;
}

function directAssetFromOptions(options) {
  const directKeys = [
    "category",
    "name",
    "state",
    "width",
    "height",
    "label",
    "theme",
    "directory",
  ];
  const hasDirectOption = directKeys.some((key) => options[key] !== undefined);
  if (!hasDirectOption) return null;
  if (options.config !== undefined) {
    throw new Error("--config cannot be combined with direct asset options.");
  }

  const required = ["category", "name", "state", "width", "height"];
  const missing = required.filter((key) => options[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`direct mode requires: ${missing.map((key) => `--${key}`).join(", ")}`);
  }

  return normalizePlaceholderSpec({
    category: options.category,
    name: options.name,
    state: options.state,
    width: options.width,
    height: options.height,
    label: options.label,
    theme: options.theme,
    directory: options.directory,
  });
}

function usage() {
  return [
    "Generate deterministic <=16-colour PNG placeholders.",
    "",
    "Config mode:",
    "  node tools/placeholder/index.mjs [--config FILE] [--output DIR] [--force]",
    "",
    "Single asset mode:",
    "  node tools/placeholder/index.mjs --output DIR --category VALUE --name VALUE",
    "    --state VALUE --width PX --height PX [--label ASCII]",
    "    [--theme neutral|cyan|sepia|magenta] [--directory SUBDIR] [--force]",
  ].join("\n");
}

export async function runCli(argumentsList, workingDirectory = process.cwd()) {
  const options = parseCliArguments(argumentsList);
  if (options.help) return { help: usage(), generated: [], skipped: [] };

  const directAsset = directAssetFromOptions(options);
  if (directAsset !== null) {
    const outputDirectory = path.resolve(
      workingDirectory,
      options.output ?? "assets/placeholders",
    );
    return generatePlaceholders({
      outputDirectory,
      assets: [directAsset],
      force: options.force,
    });
  }

  const configPath = path.resolve(
    workingDirectory,
    options.config ?? DEFAULT_CONFIG_PATH,
  );
  const config = await readPlaceholderConfig(configPath);
  const outputDirectory = options.output
    ? path.resolve(workingDirectory, options.output)
    : path.resolve(
        path.dirname(config.configPath),
        config.outputDirectory ?? "../../assets/placeholders",
      );
  return generatePlaceholders({
    outputDirectory,
    assets: config.assets,
    force: options.force,
  });
}

async function main() {
  try {
    const result = await runCli(process.argv.slice(2));
    if (result.help !== undefined) {
      console.log(result.help);
      return;
    }
    for (const generated of result.generated) console.log(`Generated ${generated}`);
    for (const skipped of result.skipped) console.warn(`Skipped existing ${skipped}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) await main();

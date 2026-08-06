import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_CONTENT_ROOT = path.join(REPOSITORY_ROOT, "content");

const DIRECTORY_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const JSON_FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*\.json$/;

function relativeDisplayPath(root, absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
}

function pathProblem(relativePath, message) {
  return { kind: "path", relativePath, message };
}

async function walkContentDirectory(contentRoot, directory = contentRoot) {
  const files = [];
  const problems = [];
  const entries = await readdir(directory, { withFileTypes: true });

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = relativeDisplayPath(contentRoot, absolutePath);

    if (entry.isDirectory()) {
      if (!DIRECTORY_NAME_PATTERN.test(entry.name)) {
        problems.push(
          pathProblem(
            relativePath,
            "directory names must use lowercase ASCII letters, digits, '-' or '_'",
          ),
        );
      }

      const nested = await walkContentDirectory(contentRoot, absolutePath);
      files.push(...nested.files);
      problems.push(...nested.problems);
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") {
      continue;
    }

    if (
      !JSON_FILE_NAME_PATTERN.test(entry.name) ||
      entry.name.includes("..") ||
      path.extname(entry.name) !== ".json"
    ) {
      problems.push(
        pathProblem(
          relativePath,
          "JSON file names must be lowercase and use only ASCII letters, digits, '.', '-' or '_'",
        ),
      );
    }

    files.push({ absolutePath, relativePath });
  }

  return { files, problems };
}

/** Loads the canonical TypeScript/Zod validator without maintaining a JS copy. */
export async function validateSchemaAndContentTiers(context) {
  const { createServer } = await import("vite");
  let server;
  try {
    server = await createServer({
      root: REPOSITORY_ROOT,
      configFile: false,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, watch: null },
    });
    const validatorModule = await server.ssrLoadModule(
      "/src/content-io/ToolContentValidator.ts",
    );
    if (typeof validatorModule.validateContentFiles !== "function") {
      throw new TypeError("ToolContentValidator must export validateContentFiles().");
    }
    const aiCacheFiles = context.files.filter((file) =>
      file.relativePath.replaceAll("\\", "/").startsWith("ai-cache/"),
    );
    const stringsFiles = context.files.filter((file) =>
      /^common\/strings\.[a-z0-9-]+\.json$/u.test(
        file.relativePath.replaceAll("\\", "/"),
      ),
    );
    const regularFiles = context.files.filter(
      (file) => !aiCacheFiles.includes(file) && !stringsFiles.includes(file),
    );
    const problems = [
      ...await validatorModule.validateContentFiles(regularFiles),
    ];

    if (stringsFiles.length > 0) {
      const schemasModule = await server.ssrLoadModule(
        "/src/content-io/schemas/index.ts",
      );
      const stringsSchema = schemasModule.StringsSchema;
      if (typeof stringsSchema?.safeParse !== "function") {
        throw new TypeError("Content schema module must export StringsSchema.");
      }
      for (const file of stringsFiles) {
        const result = stringsSchema.safeParse(file.value);
        if (result.success) continue;
        for (const issue of result.error.issues) {
          const location = issue.path.length === 0 ? "$" : `$.${issue.path.join(".")}`;
          problems.push({
            kind: "schema",
            relativePath: file.relativePath,
            message: `[SCHEMA_INVALID] ${location}: ${issue.message}`,
          });
        }
      }
    }

    if (aiCacheFiles.length > 0) {
      const cacheModule = await server.ssrLoadModule("/src/ai/Cache.ts");
      const cacheSchema = cacheModule.PreverifiedDialogueCacheFileSchema;
      if (typeof cacheSchema?.safeParse !== "function") {
        throw new TypeError("AI cache module must export PreverifiedDialogueCacheFileSchema.");
      }
      for (const file of aiCacheFiles) {
        const result = cacheSchema.safeParse(file.value);
        if (result.success) continue;
        for (const issue of result.error.issues) {
          const location = issue.path.length === 0 ? "$" : `$.${issue.path.join(".")}`;
          problems.push({
            kind: "schema",
            relativePath: file.relativePath,
            message: `[SCHEMA_INVALID] ${location}: ${issue.message}`,
          });
        }
      }
    }

    return problems;
  } catch (error) {
    return [
      {
        kind: "schema-runtime",
        relativePath: ".",
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  } finally {
    await server?.close();
  }
}

// Backward-compatible entry point retained for Phase 1 tooling consumers.
export const validateSchemaAndTier1 = validateSchemaAndContentTiers;

export async function validateContent(contentRoot = DEFAULT_CONTENT_ROOT) {
  let rootStats;
  try {
    rootStats = await stat(contentRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { checkedFiles: 0, problems: [] };
    }
    throw error;
  }

  if (!rootStats.isDirectory()) {
    return {
      checkedFiles: 0,
      problems: [
        pathProblem(
          relativeDisplayPath(REPOSITORY_ROOT, contentRoot),
          "content path exists but is not a directory",
        ),
      ],
    };
  }

  const { files, problems } = await walkContentDirectory(contentRoot);
  const parsedFiles = [];

  for (const file of files) {
    let parsed;
    try {
      const source = await readFile(file.absolutePath, "utf8");
      parsed = JSON.parse(source.replace(/^\uFEFF/, ""));
    } catch (error) {
      problems.push({
        kind: "json-syntax",
        relativePath: file.relativePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    parsedFiles.push({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      value: parsed,
    });
  }

  if (parsedFiles.length > 0) {
    const extensionProblems = await validateSchemaAndContentTiers({
      contentRoot,
      files: parsedFiles,
    });
    problems.push(...extensionProblems);
  }

  return { checkedFiles: files.length, problems };
}

async function main() {
  const result = await validateContent();

  if (result.problems.length === 0) {
    console.log(`Content validation passed (${result.checkedFiles} JSON file(s) checked).`);
    return;
  }

  console.error(`Content validation failed with ${result.problems.length} problem(s):`);
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

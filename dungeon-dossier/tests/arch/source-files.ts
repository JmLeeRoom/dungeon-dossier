import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";

export const ENGINE_SOURCE_ROOT = fileURLToPath(
  new URL("../../src/engine/", import.meta.url),
);

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

async function collect(directory: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(absolutePath)));
    } else if (
      entry.isFile() &&
      TYPESCRIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

export async function engineSourceFiles(): Promise<string[]> {
  return collect(ENGINE_SOURCE_ROOT);
}

export async function parseSourceFile(absolutePath: string): Promise<ts.SourceFile> {
  const source = await readFile(absolutePath, "utf8");
  const scriptKind = absolutePath.toLowerCase().endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

export function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const relativePath = path
    .relative(ENGINE_SOURCE_ROOT, sourceFile.fileName)
    .split(path.sep)
    .join("/");
  return `${relativePath}:${line + 1}:${character + 1}`;
}

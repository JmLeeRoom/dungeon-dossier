import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve('src');
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const TRUTH_FAMILY = /^(?:Truth(?:Graph|Claim|Relation|Record)?|ProofRule|Hypothesis)/u;

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (entry.isFile() && TYPESCRIPT_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function parsed(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function resolvedImport(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  return path.resolve(path.dirname(importer), specifier);
}

function display(file: string): string {
  return path.relative(SOURCE_ROOT, file).replaceAll('\\', '/');
}

describe('layer dependency sentries', () => {
  it('prevents UI source from importing the engine directly', async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(path.join(SOURCE_ROOT, 'ui'))) {
      const sourceFile = parsed(file, await readFile(file, 'utf8'));
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (specifier === undefined || !ts.isStringLiteral(specifier)) continue;
        const target = resolvedImport(file, specifier.text);
        if (target?.startsWith(path.join(SOURCE_ROOT, 'engine')) === true) {
          violations.push(`${display(file)} -> ${specifier.text}`);
        }
      }
    }

    expect(violations, `UI imported engine modules:\n${violations.join('\n')}`).toEqual([]);
  });

  it('prevents AI source from importing engine truth-family modules or types', async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(path.join(SOURCE_ROOT, 'ai'))) {
      const sourceFile = parsed(file, await readFile(file, 'utf8'));
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (!ts.isStringLiteral(specifier)) continue;
        const target = resolvedImport(file, specifier.text);
        if (target?.startsWith(path.join(SOURCE_ROOT, 'engine')) === true) {
          violations.push(`${display(file)} -> forbidden module ${specifier.text}`);
        }
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            if (TRUTH_FAMILY.test(importedName)) {
              violations.push(`${display(file)} -> forbidden type ${importedName}`);
            }
          }
        }
      }
    }

    expect(violations, `AI reached truth-family APIs:\n${violations.join('\n')}`).toEqual([]);
  });
});

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  engineSourceFiles,
  parseSourceFile,
  sourceLocation,
} from "./source-files";

const CONTENT_ID_PREFIX = /(?:^|[^A-Za-z0-9])(?:case_|clm_|ev_|ent_|enc_)/i;
const CASES_ROOT = path.resolve("content/cases");

interface AuthoredCaseIdentityProbe {
  readonly entities?: readonly Readonly<{
    attributes?: Readonly<Record<string, unknown>>;
  }>[];
  readonly dialogue?: Readonly<{
    speaker_profiles?: Readonly<Record<string, Readonly<{ race?: unknown }>>>;
  }>;
}

/**
 * Case IDs have a stable prefix and are covered below. Directory names and
 * authored race/archetype labels do not, so collect those identities from the
 * data itself rather than maintaining another engine-era catalogue in tests.
 */
async function authoredIdentityLiterals(): Promise<ReadonlySet<string>> {
  const identities = new Set<string>();
  const entries = await readdir(CASES_ROOT, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    identities.add(entry.name);
    let probe: AuthoredCaseIdentityProbe;
    try {
      probe = JSON.parse(
        await readFile(path.join(CASES_ROOT, entry.name, "case.json"), "utf8"),
      ) as AuthoredCaseIdentityProbe;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const entity of probe.entities ?? []) {
      const archetype = entity.attributes?.archetype;
      if (typeof archetype === "string" && archetype.length > 0) identities.add(archetype);
    }
    for (const profile of Object.values(probe.dialogue?.speaker_profiles ?? {})) {
      if (typeof profile.race === "string" && profile.race.length > 0) {
        identities.add(profile.race);
      }
    }
  }
  return identities;
}

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExternalModuleReference(parent) && parent.expression === node) ||
    (ts.isCallExpression(parent) &&
      parent.arguments.at(0) === node &&
      (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(parent.expression) && parent.expression.text === "require")))
  );
}

function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  ) {
    return (node as ts.TemplateLiteralToken).text;
  }

  return undefined;
}

function staticStringExpression(node: ts.Node): string | undefined {
  const directText = literalText(node);
  if (directText !== undefined) {
    return directText;
  }

  if (ts.isParenthesizedExpression(node)) {
    return staticStringExpression(node.expression);
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStringExpression(node.left);
    const right = staticStringExpression(node.right);
    if (left !== undefined && right !== undefined) {
      return left + right;
    }
  }

  return undefined;
}

describe("engine content independence", () => {
  it("contains no hardcoded content IDs, case directories, or authored archetypes", async () => {
    const violations: string[] = [];
    const authoredIdentities = await authoredIdentityLiterals();

    for (const absolutePath of await engineSourceFiles()) {
      const sourceFile = await parseSourceFile(absolutePath);

      const visit = (node: ts.Node): void => {
        const text = staticStringExpression(node);
        if (
          text !== undefined &&
          !isModuleSpecifier(node) &&
          (CONTENT_ID_PREFIX.test(text) || authoredIdentities.has(text))
        ) {
          violations.push(`${sourceLocation(sourceFile, node)} -> ${JSON.stringify(text)}`);
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    expect(
      violations,
      `Hardcoded content identities found in src/engine:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

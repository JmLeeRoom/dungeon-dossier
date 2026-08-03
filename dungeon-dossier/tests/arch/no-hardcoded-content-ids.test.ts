import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  engineSourceFiles,
  parseSourceFile,
  sourceLocation,
} from "./source-files";

const CONTENT_ID_PREFIX = /(?:^|[^A-Za-z0-9])(?:case_|clm_|ev_|ent_|enc_)/i;

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
  it("contains no hardcoded content-ID prefixes in string literals", async () => {
    const violations: string[] = [];

    for (const absolutePath of await engineSourceFiles()) {
      const sourceFile = await parseSourceFile(absolutePath);

      const visit = (node: ts.Node): void => {
        const text = staticStringExpression(node);
        if (
          text !== undefined &&
          !isModuleSpecifier(node) &&
          CONTENT_ID_PREFIX.test(text)
        ) {
          violations.push(`${sourceLocation(sourceFile, node)} -> ${JSON.stringify(text)}`);
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    expect(
      violations,
      `Hardcoded content IDs found in src/engine:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

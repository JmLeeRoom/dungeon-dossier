import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  engineSourceFiles,
  parseSourceFile,
  sourceLocation,
} from "./source-files";

const FORBIDDEN_RENDERER_IMPORT =
  /^(?:pixi(?:\.js)?(?:\/|$)|@pixi\/|howler(?:\/|$))/i;
const FORBIDDEN_GLOBALS = new Set(["window", "document", "fetch"]);

function staticString(node: ts.Node | undefined): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }

  if (node && ts.isParenthesizedExpression(node)) {
    return staticString(node.expression);
  }

  if (
    node &&
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(node.left);
    const right = staticString(node.right);
    if (left !== undefined && right !== undefined) {
      return left + right;
    }
  }

  return undefined;
}

function moduleSpecifier(node: ts.Node): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier
  ) {
    return staticString(node.moduleSpecifier);
  }

  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression
  ) {
    return staticString(node.moduleReference.expression);
  }

  if (ts.isCallExpression(node)) {
    const [firstArgument] = node.arguments;
    if (
      firstArgument !== undefined &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      return staticString(firstArgument);
    }
  }

  return undefined;
}

function isPropertyNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    // A repository/client `.fetch()` call is still network I/O inside the
    // engine, even when it is not the global fetch function.
    if (node.text === "fetch") {
      return false;
    }
    return !(
      ts.isIdentifier(parent.expression) &&
      (parent.expression.text === "globalThis" || parent.expression.text === "self")
    );
  }

  return (
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
      parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

function forbiddenStaticCall(node: ts.Node): "Date.now" | "Math.random" | undefined {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === "Date" && node.name.text === "now") {
      return "Date.now";
    }
    if (node.expression.text === "Math" && node.name.text === "random") {
      return "Math.random";
    }
  }

  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.argumentExpression
  ) {
    const property = staticString(node.argumentExpression);
    if (node.expression.text === "Date" && property === "now") {
      return "Date.now";
    }
    if (node.expression.text === "Math" && property === "random") {
      return "Math.random";
    }
  }

  return undefined;
}

function forbiddenBracketAccess(node: ts.Node): string | undefined {
  if (
    !ts.isElementAccessExpression(node) ||
    !node.argumentExpression
  ) {
    return undefined;
  }

  const property = staticString(node.argumentExpression);
  if (property === "fetch") {
    return "fetch";
  }

  if (
    (property === "window" || property === "document") &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === "globalThis" || node.expression.text === "self")
  ) {
    return property;
  }

  return undefined;
}

function forbiddenDestructure(node: ts.Node): string | undefined {
  if (
    !ts.isVariableDeclaration(node) ||
    !ts.isObjectBindingPattern(node.name) ||
    !node.initializer ||
    !ts.isIdentifier(node.initializer)
  ) {
    return undefined;
  }

  const source = node.initializer.text;
  for (const element of node.name.elements) {
    const property = element.propertyName ?? element.name;
    if (!ts.isIdentifier(property) && !ts.isStringLiteral(property)) {
      continue;
    }

    if (source === "Date" && property.text === "now") {
      return "Date.now";
    }
    if (source === "Math" && property.text === "random") {
      return "Math.random";
    }
    if (property.text === "fetch") {
      return "fetch";
    }
    if (
      (source === "globalThis" || source === "self") &&
      FORBIDDEN_GLOBALS.has(property.text)
    ) {
      return property.text;
    }
  }

  return undefined;
}

describe("headless engine boundary", () => {
  it("does not import renderers or use browser/network/nondeterministic globals", async () => {
    const violations: string[] = [];

    for (const absolutePath of await engineSourceFiles()) {
      const sourceFile = await parseSourceFile(absolutePath);

      const visit = (node: ts.Node): void => {
        const importedModule = moduleSpecifier(node);
        if (importedModule && FORBIDDEN_RENDERER_IMPORT.test(importedModule)) {
          violations.push(
            `${sourceLocation(sourceFile, node)} -> forbidden import ${JSON.stringify(importedModule)}`,
          );
        }

        if (
          ts.isIdentifier(node) &&
          FORBIDDEN_GLOBALS.has(node.text) &&
          !isPropertyNameOnly(node)
        ) {
          violations.push(`${sourceLocation(sourceFile, node)} -> forbidden global ${node.text}`);
        }

        const staticCall = forbiddenStaticCall(node);
        if (staticCall) {
          violations.push(`${sourceLocation(sourceFile, node)} -> forbidden call ${staticCall}`);
        }

        const bracketAccess = forbiddenBracketAccess(node);
        if (bracketAccess) {
          violations.push(
            `${sourceLocation(sourceFile, node)} -> forbidden access ${bracketAccess}`,
          );
        }

        const destructuredAccess = forbiddenDestructure(node);
        if (destructuredAccess) {
          violations.push(
            `${sourceLocation(sourceFile, node)} -> forbidden destructure ${destructuredAccess}`,
          );
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    expect(
      violations,
      `Forbidden src/engine dependencies or globals found:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

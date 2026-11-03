/**
 * The sign-in page's words come from the copy system.
 *
 * Failure modes, each with the test that catches it:
 *  1. A sentence on the first screen a person sees is written in the page, outside the copy system, so it can
 *     drift from the rest of the words and escapes the writing guards. The page's source is read for visible text.
 *  2. An error says what the system did in its own words ("authentication is not configured for this deployment",
 *     "not on the approved access list") instead of what happened and what to do next.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { SIGN_IN } from "@/lib/screening/copy";

import { textProblems } from "./helpers";

const APP = path.resolve(__dirname, "../../../app/sign-in");

/** Words only a developer uses; a person who signs in does not meet them. */
const TECHNICAL =
  /\b(?:auth|authentication|configured|configuration|deployment|allowlist|callback|token|otp|smtp|one-time|secure)\b/i;

describe("the sign-in words", () => {
  it("are plain, short and say what to do", () => {
    for (const [key, text] of Object.entries({
      ...SIGN_IN.errors,
      lead: SIGN_IN.lead,
      sent: SIGN_IN.sent,
      unavailable: SIGN_IN.unavailable,
    })) {
      expect(textProblems(text), key).toEqual([]);
      expect(text, key).not.toMatch(TECHNICAL);
      expect(text.split(/\s+/).length, key).toBeLessThanOrEqual(30);
    }
    for (const text of [SIGN_IN.title, SIGN_IN.emailLabel, SIGN_IN.button])
      expect(textProblems(text, { sentence: false }), text).toEqual([]);
  });

  it("says in each error what happened and what to do next, without blame", () => {
    expect(Object.keys(SIGN_IN.errors).sort()).toEqual([
      "allowlist",
      "callback",
      "configuration",
      "delivery",
    ]);
    for (const [key, text] of Object.entries(SIGN_IN.errors)) {
      // A next step: something to try, ask or tell, or a link to ask for.
      expect(text, key).toMatch(/\b(?:try|ask|tell)\b/i);
      expect(text, key).not.toMatch(
        /\b(?:you (?:failed|did not|entered|made)|your fault|invalid|illegal|denied|forbidden)\b/i
      );
    }
  });
});

/** Visible text a source file writes itself: JSX text, sentence-like strings, and the attributes a person reads. */
function literalsIn(text: string): string[] {
  const source = ts.createSourceFile("source.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const READ = new Set(["aria-label", "title", "placeholder", "alt", "aria-description", "label"]);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) found.push(node.text.trim());
    if (
      ts.isJsxAttribute(node) &&
      READ.has(node.name.getText()) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    )
      found.push(node.initializer.text);
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !ts.isJsxAttribute(node.parent) &&
      /\p{L}+\s+\p{L}+/u.test(node.text) &&
      !node.text.startsWith("/") &&
      !node.text.startsWith("use ")
    )
      found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
const visibleLiterals = (file: string) => literalsIn(readFileSync(file, "utf8"));

describe("the sign-in page", () => {
  it("writes no visible word of its own", () => {
    const literals = ["page.tsx", "actions.ts", "layout.tsx"].flatMap((f) =>
      visibleLiterals(path.join(APP, f))
    );
    expect(literals).toEqual([]);
  });

  it("would notice a literal if one were written", () => {
    const probe =
      "export const A = () => <main aria-label=\"Sign in\"><h1>Sign in here</h1>{'Check your inbox now'}</main>;";
    expect(literalsIn(probe)).toEqual(["Sign in", "Sign in here", "Check your inbox now"]);
    // Names, types and addresses are not words a person reads.
    expect(
      literalsIn('export const A = () => <input id="email" type="email" className={styles.x} />;')
    ).toEqual([]);
  });
});

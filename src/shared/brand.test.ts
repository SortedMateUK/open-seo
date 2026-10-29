import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/shared/brand";

// This fork is white-labelled. Upstream merges routinely reintroduce the
// upstream product name in portal copy, so this guard fails the build the
// moment a user-visible "OpenSEO" lands in the client or routes. Server code
// (MCP server name, emails) is intentionally out of scope.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORTAL_DIRS = ["src/client", "src/routes"];
// "OpenSEO-Audit" is the crawler's real user agent, which site owners allow-list.
const UPSTREAM_NAME = /\bOpenSEO\b(?!-Audit)/;

function portalSourceFiles(): string[] {
  return PORTAL_DIRS.flatMap((dir) =>
    readdirSync(join(REPO_ROOT, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)),
  );
}

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  );
}

describe("portal branding", () => {
  it("has no upstream product name in user-visible portal source", () => {
    const hits = portalSourceFiles().flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => !isComment(line) && UPSTREAM_NAME.test(line))
        .map(({ index }) => `${file.slice(REPO_ROOT.length)}:${index + 1}`),
    );

    expect(hits).toEqual([]);
  });

  it("names the installable app after the brand", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(join(REPO_ROOT, "src/public/site.webmanifest"), "utf8"),
    );

    expect(manifest).toMatchObject({ name: APP_NAME, short_name: APP_NAME });
  });
});

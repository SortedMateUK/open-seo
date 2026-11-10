import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { brand } from "../../vite-plugin-brand";
import { APP_NAME } from "@/shared/brand";

// This fork is white-labelled at build time by vite-plugin-brand.ts, so the
// portal source stays identical to upstream and releases merge cleanly.
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function transform(code: string, id: string): string {
  const hook = brand().transform;
  if (typeof hook !== "function") throw new Error("brand() has no transform");
  // The hook never reads `this`, so it runs without a Rollup plugin context.
  const result: unknown = Reflect.apply(hook, undefined, [code, id]);
  return typeof result === "object" &&
    result !== null &&
    "code" in result &&
    typeof result.code === "string"
    ? result.code
    : code;
}

/** The declarations of the first rule whose selector starts at `selector`. */
function ruleBody(css: string, selector: string): string {
  return css.slice(css.indexOf(selector)).split("}")[0] ?? "";
}

describe("portal branding", () => {
  it("is applied to the app build", () => {
    // An upstream merge that rewrites vite.config.ts must keep the plugin, or
    // the portal silently goes back to the upstream name.
    expect(read("vite.config.ts")).toMatch(/^\s+brand\(\),$/m);
  });

  it("renames the product in portal modules and the MCP widget bundle", () => {
    const copy = `<p>Use OpenSEO in Claude</p>; title: "OpenSEO"`;
    const branded = `<p>Use ${APP_NAME} in Claude</p>; title: "${APP_NAME}"`;

    expect(transform(copy, "/repo/src/routes/_app/ai.tsx")).toBe(branded);
    expect(
      transform(
        copy,
        "/repo/src/client/layout/AppShell.tsx?tsr-split=component",
      ),
    ).toBe(branded);
    expect(transform(copy, "\0virtual:openseo-mcp-widget")).toBe(branded);
  });

  it("leaves identifiers, ids, the crawler user agent and server code alone", () => {
    const code =
      'OpenSeoWidgets; OpenSEOIcon; "openseo.so"; data-theme="openseo"; "OpenSEO-Audit/1.0"';

    expect(transform(code, "/repo/src/client/mcp-widgets/main.tsx")).toBe(code);
    expect(transform("OpenSEO", "/repo/src/server/mcp/server.ts")).toBe(
      "OpenSEO",
    );
    expect(transform("OpenSEO", "/repo/src/client/lib/x.test.ts")).toBe(
      "OpenSEO",
    );
  });

  it("names the installable app after the brand", () => {
    const manifest: unknown = JSON.parse(read("src/public/site.webmanifest"));

    expect(manifest).toMatchObject({ name: APP_NAME, short_name: APP_NAME });
  });

  it("recolours the variables upstream's themes actually use", () => {
    // Upstream has swapped theme systems before (daisyUI to shadcn); if it
    // renames these again the brand layer silently stops applying.
    const appCss = read("src/client/styles/app.css");
    const brandCss = read("src/client/styles/brand.css");
    for (const theme of ["openseo", "openseo-dark"]) {
      const upstream = ruleBody(appCss, `[data-theme="${theme}"]`);
      const ours = ruleBody(brandCss, `html[data-theme="${theme}"]`);
      for (const name of ["--primary", "--background", "--foreground"]) {
        expect(upstream).toContain(`${name}:`);
        expect(ours).toContain(`${name}:`);
      }
    }
  });
});

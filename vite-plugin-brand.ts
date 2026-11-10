import type { Plugin } from "vite";
import { APP_NAME } from "./src/shared/brand.ts";

// SortedMate fork: white-labels the portal at build time, so upstream's
// screens stay byte-for-byte upstream and merging a release never conflicts
// over the product name. Every user-visible "OpenSEO" in portal modules
// (src/client, src/routes) and in the inline MCP widget bundle becomes
// APP_NAME. Server code (MCP server name, emails) is left alone on purpose.
//
// Whole-word only, so identifiers such as OpenSeoWidgets or OpenSEOIcon and
// lower-case ids (openseo.so, data-theme="openseo") are untouched.
// "OpenSEO-Audit" is the crawler's real user agent, which site owners
// allow-list, so it keeps its name.
const UPSTREAM_NAME = /\bOpenSEO\b(?!-Audit)/g;
const PORTAL_MODULE = /\/src\/(client|routes)\/.+\.(ts|tsx)$/;
const TEST_MODULE = /\.test\.tsx?$/;
// The virtual module vite-plugin-mcp-widgets.ts serves the widget bundle from.
const MCP_WIDGET_MODULE = "\0virtual:openseo-mcp-widget";

function brandText(code: string): string {
  return code.replace(UPSTREAM_NAME, APP_NAME);
}

function isBrandedModule(id: string): boolean {
  if (id === MCP_WIDGET_MODULE) return true;
  const path = id.split("?")[0] ?? "";
  return PORTAL_MODULE.test(path) && !TEST_MODULE.test(path);
}

export function brand(): Plugin {
  return {
    name: "sortedmate-brand",
    transform(code, id) {
      if (!isBrandedModule(id)) return;
      const branded = brandText(code);
      if (branded === code) return;
      return { code: branded, map: null };
    },
  };
}

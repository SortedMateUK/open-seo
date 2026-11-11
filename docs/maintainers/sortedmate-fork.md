# SortedMate fork

This repository is SortedMate's self-hosted copy of every-app/open-seo, shown to
users as "SortedMate SEO". It should differ from upstream only where it has to,
so each release merges with as few conflicts as possible.

## What the fork changes

- **Branding, at build time.** `vite-plugin-brand.ts` replaces every
  whole-word "OpenSEO" in portal modules (`src/client`, `src/routes`) and in
  the inline MCP widget bundle with `APP_NAME` from `src/shared/brand.ts`.
  Upstream's screens stay unedited, so their copy changes merge cleanly.
  Identifiers, lower-case ids (`openseo.so`, the `openseo` theme ids) and the
  crawler's `OpenSEO-Audit` user agent keep their names. Server code (MCP
  server name, emails) and `src/shared` text are not rebranded.
- **Colours and fonts.** `src/client/styles/brand.css` overrides upstream's
  theme variables. It is loaded after `app.css` by two lines in
  `src/routes/__root.tsx`.
- **Icons and manifest** in `src/public/`.
- **Cloudflare Access service tokens** for machine logins
  (`ACCESS_SERVICE_TOKEN_IDS`, `src/middleware/ensure-user/accessIdentity.ts`).
- **Deploy safety.** `.github/workflows/deploy-selfhost.yml` deploys by hand
  only. `scripts/selfhost-secrets-guard.mjs` fails the run if a live Worker
  secret goes missing. The alchemy patch in `patches/` also skips env values
  that resolve to null, so an unset optional secret can't blank a kept one.

`src/shared/brand.test.ts` fails if a merge drops the plugin from
`vite.config.ts`, if the plugin stops renaming, or if upstream renames the
theme variables that `brand.css` overrides.

## Merging an upstream release

1. `git fetch https://github.com/every-app/open-seo --tags`, then merge the
   release tag into a branch.
2. Take upstream's side for every file under `src/client` and `src/routes`.
   The only exception is the two `brand.css` lines in `__root.tsx`. Don't add
   `APP_NAME` imports to upstream screens: the plugin covers them.
3. If upstream changes `patches/alchemy@*.patch`, keep its version and re-add
   the null-skip hunk with `pnpm patch` / `pnpm patch-commit`.
4. Check `scripts/selfhost-secrets-guard.mjs` against the secrets
   `deploy/alchemy/alchemy.run.ts` now declares. A secret that upstream stops
   deploying goes in `RETIRED`.
5. Run `pnpm lint`, `npx tsc --noEmit`, `pnpm test` and `pnpm build`, then
   search `dist/client` for `OpenSEO`. The only hits left should be agent
   prompts and `src/shared` text.

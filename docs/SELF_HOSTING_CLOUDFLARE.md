# Cloudflare Self-Hosting

Host OpenSEO on Cloudflare for internet-facing self-hosting across multiple devices or with your team. One deploy command provisions everything, including the Cloudflare Access login gate. Works on Cloudflare's free plan.

Related guides:

- [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md): connect the MCP server, telemetry.
- [Legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): maintenance for installs created with the retired Deploy-button or manual Wrangler flows.

## Prerequisites

- **Node 22.6 or newer** and **pnpm** (`corepack enable` sets it up).
- **A Cloudflare account with R2 enabled.** Activating R2 requires a payment method on file, even within its free tier — if you have never used R2, open `R2` in the Cloudflare dashboard once.
- **A DataForSEO account** — see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md).

## 1) Clone your OpenSEO repo

Fork `every-app/open-seo` on GitHub if you want a repo you control, then clone it locally:

```bash
git clone https://github.com/YOUR_GITHUB_USER/open-seo.git
cd open-seo
corepack enable
pnpm install
```

If you do not need a fork, clone the upstream repo instead:

```bash
git clone https://github.com/every-app/open-seo.git
cd open-seo
corepack enable
pnpm install
```

## 2) Log in to Cloudflare (once)

```bash
pnpm alchemy login                # answer yes to "Customize OAuth scopes?" and enable access:write
pnpm alchemy cloudflare bootstrap # deploys alchemy's state-store Worker to your account
```

Already logged in from before without the `access:write` scope? Run `pnpm alchemy login --configure` — a plain repeat login doesn't re-ask about scopes.

## 3) Create `.env.selfhost`

Copy the template and fill in the required values:

```bash
cp .env.selfhost.example .env.selfhost
```

## 4) Deploy

```bash
pnpm deploy:selfhost --yes
```

This provisions the D1 database, KV namespaces, and R2 bucket, applies the database migrations, deploys the Workers, and creates the Cloudflare Access application protecting it (allowing exactly `ACCESS_ALLOWED_EMAILS`). If the account has no Zero Trust team yet, one is created for you, named after your workers.dev subdomain.

To manage the Access application yourself instead, set `TEAM_DOMAIN` (`https://your-team.cloudflareaccess.com`) and `POLICY_AUD` (the application's audience tag) in `.env.selfhost` — the deploy then provisions no Access resources.

### Machine access (optional): Access service tokens

To call OpenSEO from a script or another server — for example the MCP server at `/mcp` from a scheduled job — use a [Cloudflare Access service token](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/) instead of a browser login:

1. In Zero Trust, **Access → Service credentials → Create service token**. Keep the client id and secret somewhere safe; the secret is shown once.
2. Put the token's **id** (a UUID) in `.env.selfhost` as `ACCESS_SERVICE_TOKEN_IDS` (comma-separate several) and redeploy. The deploy adds a Service Auth policy admitting exactly those tokens, and sets `ACCESS_ALLOW_SERVICE_TOKENS=true` on the Worker.
3. Send `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers on each request.

Each token works in the shared workspace as its own service user. If you manage the Access application yourself (`TEAM_DOMAIN` and `POLICY_AUD`), add the Service Auth policy there and set `ACCESS_ALLOW_SERVICE_TOKENS=true`.

## 5) Validate setup

1. Open the Worker URL printed at the end of the deploy.
2. Sign in with Cloudflare Access.
3. OpenSEO should load after login.

If it doesn't, see Troubleshooting below.

## Updating to the latest OpenSEO version

```bash
git pull        # or: git fetch upstream && git merge upstream/main, if you forked
pnpm install
pnpm deploy:selfhost --yes
```

## Giving teammates access

Add the teammate to `ACCESS_ALLOWED_EMAILS` in `.env.selfhost` and redeploy. Dashboard edits to that Access policy are overwritten on the next deploy. (If you manage the Access application yourself, edit its Allow policy in Zero Trust instead.)

Everyone allowed through Cloudflare Access works in one shared workspace and sees the same projects. Deployments upgraded from older versions (which gave each user a separate workspace) show a one-time dashboard banner — clicking it migrates all previous per-user work into the shared workspace.

## Troubleshooting

- Login fails: re-check `ACCESS_ALLOWED_EMAILS` in `.env.selfhost` and redeploy.
- `https://<your-worker-hostname>/api/health` reports runtime configuration checks and database status.
- For server errors, open the Worker `Logs` or run `pnpm exec wrangler tail`. Site audits run in a separate worker: `pnpm exec wrangler tail open-seo-selfhost-audit`.

## Tearing it down

```bash
pnpm alchemy destroy --env-file .env.selfhost --stage selfhost
```

This deletes the Workers, the stage-suffixed D1/KV/R2 resources (including your data), and the Access application.

## Next steps

See [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) for connecting MCP clients and telemetry.

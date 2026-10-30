// SortedMate fork: proves a self-host deploy kept every live Worker secret.
// `snapshot` (before the deploy) saves the secret names on each Worker;
// `verify` (after) fails if any of them is gone. Names only, never values.
// On 29 Oct 2026 a deploy replaced every secret with a null binding and
// nothing noticed until the portal's DataForSEO calls started failing.
//
//   node scripts/selfhost-secrets-guard.mjs snapshot|verify
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (the deploy's own).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const WORKERS = ["open-seo-selfhost", "open-seo-selfhost-audit"];
const SNAPSHOT_FILE = ".selfhost-secrets-before.json";
// Hosted-service keys the September deploy carried but the self-host never
// uses. ENV_SELFHOST leaves them out, so dropping them is expected.
const UNUSED = new Set([
  "AUTUMN_SECRET_KEY",
  "AUTUMN_WEBHOOK_SECRET",
  "DUB_API_KEY",
  "GDPR_ERASURE_SECRET",
  "LOOPS_API_KEY",
  "TURNSTILE_SECRET_KEY",
]);

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId } =
  process.env;
const mode = process.argv[2];

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!token || !accountId) {
  fail("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set");
}
if (mode !== "snapshot" && mode !== "verify") {
  fail("usage: selfhost-secrets-guard.mjs snapshot|verify");
}

const secretNames = async (worker) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${worker}/secrets`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  // A Worker that doesn't exist yet (first deploy) has no secrets to keep.
  if (response.status === 404) return [];
  const body = await response.json();
  if (!response.ok || !body.success) {
    fail(
      `could not list secrets on ${worker}: HTTP ${response.status} ${JSON.stringify(body.errors ?? [])}`,
    );
  }
  return body.result.map((secret) => secret.name).sort();
};

const current = {};
for (const worker of WORKERS) current[worker] = await secretNames(worker);

if (mode === "snapshot") {
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(current, null, 2));
  for (const worker of WORKERS) {
    console.log(`${worker}: ${current[worker].length} secrets before deploy`);
  }
  process.exit(0);
}

if (!existsSync(SNAPSHOT_FILE)) {
  fail(`${SNAPSHOT_FILE} not found; run the snapshot step before deploying`);
}
const before = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
let lost = 0;
for (const worker of WORKERS) {
  const missing = (before[worker] ?? []).filter(
    (name) => !UNUSED.has(name) && !current[worker].includes(name),
  );
  console.log(
    `${worker}: ${current[worker].length} secrets after deploy (${before[worker]?.length ?? 0} before)`,
  );
  if (missing.length > 0) {
    lost += missing.length;
    console.error(
      `::error::${worker} lost ${missing.join(", ")}. Roll the Worker back in the dashboard (Deployments), then add the missing keys to ENV_SELFHOST and redeploy.`,
    );
  }
}
process.exit(lost > 0 ? 1 : 0);

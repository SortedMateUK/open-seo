// SortedMate fork: points each Worker's live traffic at a known-good version
// (100%; force=true accepts that its secrets differ from the newest
// version, as the dashboard rollback does), then prints the live version and its secret names (never values).
//
//   node scripts/selfhost-rollback.mjs <worker>=<version id> ...
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId } =
  process.env;

const api = async (method, path, body) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const json = await response.json();
  if (!response.ok || !json.success) {
    console.error(
      `::error::${method} ${path}: HTTP ${response.status} ${JSON.stringify(json.errors ?? [])}`,
    );
    process.exit(1);
  }
  return json.result;
};

for (const [worker, versionId] of process.argv.slice(2).map((a) => a.split("="))) {
  await api("POST", `/workers/scripts/${worker}/deployments?force=true`, {
    strategy: "percentage",
    versions: [{ version_id: versionId, percentage: 100 }],
    annotations: { "workers/message": "Rollback to the 29 Sep version" },
  });
  const { deployments } = await api("GET", `/workers/scripts/${worker}/deployments`);
  const live = deployments[0].versions;
  const version = await api("GET", `/workers/scripts/${worker}/versions/${live[0].version_id}`);
  const secrets = version.resources.bindings
    .filter((b) => b.type === "secret_text")
    .map((b) => b.name);
  console.log(
    `${worker}: live ${JSON.stringify(live)}; ${secrets.length} secrets: ${secrets.join(", ")}`,
  );
  if (live.length !== 1 || live[0].version_id !== versionId) process.exit(1);
}

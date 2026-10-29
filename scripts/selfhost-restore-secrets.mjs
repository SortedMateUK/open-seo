// SortedMate fork: copies every secret from an earlier Worker version into a
// new, undeployed version, so the next "Deploy self-host" keeps them
// (alchemy uploads with keep_bindings: ["secret_text"], which copies from the
// newest version). Nobody sees or re-enters a value: Cloudflare copies each
// one through an `inherit` binding pinned to the old version. Only the
// Workers versions API accepts a pinned version id; script upload accepts
// "latest" only.
//
// The new version runs a placeholder that answers 503 and takes no traffic:
// it is uploaded without a deployment. Names only are printed, never values.
//
//   node scripts/selfhost-restore-secrets.mjs <worker>=<version id> ...
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (the deploy's own).

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId } =
  process.env;

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!token || !accountId) {
  fail("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set");
}
const targets = process.argv.slice(2).map((arg) => arg.split("="));
if (targets.length === 0 || targets.some(([w, v]) => !w || !v)) {
  fail("usage: selfhost-restore-secrets.mjs <worker>=<version id> ...");
}

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
    fail(
      `${method} ${path}: HTTP ${response.status} ${JSON.stringify(json.errors ?? [])}`,
    );
  }
  return json.result;
};

const secretNamesOf = async (worker, versionId) => {
  const version = await api(
    "GET",
    `/workers/scripts/${worker}/versions/${versionId}`,
  );
  return version.resources.bindings
    .filter((binding) => binding.type === "secret_text")
    .map((binding) => binding.name)
    .sort();
};

const placeholder = `export default {
  fetch() {
    return new Response("Secrets carrier version, not for traffic", { status: 503 });
  },
};
`;

const liveVersions = async (worker) => {
  const { deployments } = await api(
    "GET",
    `/workers/scripts/${worker}/deployments`,
  );
  return JSON.stringify(deployments[0]?.versions ?? []);
};

for (const [worker, sourceVersion] of targets) {
  const liveBefore = await liveVersions(worker);
  const names = await secretNamesOf(worker, sourceVersion);
  if (names.length === 0) {
    fail(`${worker} version ${sourceVersion} has no secrets to copy`);
  }
  console.log(
    `${worker}: copying ${names.length} secrets from ${sourceVersion}: ${names.join(", ")}`,
  );

  // No `deploy` flag: the version is uploaded but serves no traffic.
  const created = await api("POST", `/workers/workers/${worker}/versions`, {
    main_module: "carrier.mjs",
    modules: [
      {
        name: "carrier.mjs",
        content_type: "application/javascript+module",
        content_base64: Buffer.from(placeholder).toString("base64"),
      },
    ],
    compatibility_date: "2025-09-02",
    bindings: names.map((name) => ({
      type: "inherit",
      name,
      version_id: sourceVersion,
    })),
    annotations: {
      "workers/message": `Secrets carrier: copies secrets from ${sourceVersion}. Not for traffic.`,
    },
  });

  const copied = await secretNamesOf(worker, created.id);
  const missing = names.filter((name) => !copied.includes(name));
  if (missing.length > 0) {
    fail(`${worker} carrier ${created.id} is missing ${missing.join(", ")}`);
  }
  if ((await liveVersions(worker)) !== liveBefore) {
    fail(`${worker}: the live deployment changed; roll back in the dashboard`);
  }
  console.log(
    `${worker}: carrier version ${created.id} holds all ${copied.length} secrets (not deployed)`,
  );
}

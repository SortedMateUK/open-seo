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
  return json;
};
const get = async (path) => (await api("GET", path)).result;

// Every page of an account-wide list.
const listAll = async (path) => {
  const items = [];
  for (let page = 1; ; page++) {
    const { result, result_info: info } = await api(
      "GET",
      `${path}?per_page=100&page=${page}`,
    );
    items.push(...result);
    if (!info || result.length === 0 || page >= (info.total_pages ?? page)) {
      return items;
    }
  }
};

const secretNamesOf = async (worker, versionId) => {
  const version = await get(`/workers/scripts/${worker}/versions/${versionId}`);
  return version.resources.bindings
    .filter((binding) => binding.type === "secret_text")
    .map((binding) => binding.name)
    .sort();
};

// Cloudflare rejects a version that drops a Durable Object or Workflow class
// the Worker implements, so the placeholder exports a stub of each one.
const classesOf = async (worker) => {
  const namespaces = await listAll("/workers/durable_objects/namespaces");
  const workflows = await listAll("/workflows");
  return {
    durableObjects: namespaces
      .filter((namespace) => namespace.script === worker)
      .map((namespace) => namespace.class),
    workflows: workflows
      .filter((workflow) => workflow.script_name === worker)
      .map((workflow) => workflow.class_name),
  };
};

const placeholderFor = ({ durableObjects, workflows }) =>
  [
    `import { DurableObject, WorkflowEntrypoint } from "cloudflare:workers";`,
    ...durableObjects.map(
      (name) => `export class ${name} extends DurableObject {}`,
    ),
    ...workflows.map(
      (name) =>
        `export class ${name} extends WorkflowEntrypoint { async run() { throw new Error("secrets carrier"); } }`,
    ),
    `export default {`,
    `  fetch() {`,
    `    return new Response("Secrets carrier version, not for traffic", { status: 503 });`,
    `  },`,
    `};`,
    ``,
  ].join("\n");

const liveVersions = async (worker) => {
  const { deployments } = await get(`/workers/scripts/${worker}/deployments`);
  return JSON.stringify(deployments[0]?.versions ?? []);
};

// Read everything for every Worker first, so a bad version id or a missing
// permission stops the run before any carrier is uploaded.
const plans = [];
for (const [worker, sourceVersion] of targets) {
  const names = await secretNamesOf(worker, sourceVersion);
  if (names.length === 0) {
    fail(`${worker} version ${sourceVersion} has no secrets to copy`);
  }
  const classes = await classesOf(worker);
  console.log(
    `${worker}: will copy ${names.length} secrets from ${sourceVersion}: ${names.join(", ")}; stubbing classes ${[...classes.durableObjects, ...classes.workflows].join(", ") || "(none)"}`,
  );
  plans.push({ worker, sourceVersion, names, classes });
}

for (const { worker, sourceVersion, names, classes } of plans) {
  const liveBefore = await liveVersions(worker);

  // No `deploy` flag: the version is uploaded but serves no traffic.
  const { result: created } = await api(
    "POST",
    `/workers/workers/${worker}/versions`,
    {
      main_module: "carrier.mjs",
      modules: [
        {
          name: "carrier.mjs",
          content_type: "application/javascript+module",
          content_base64: Buffer.from(placeholderFor(classes)).toString(
            "base64",
          ),
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
    },
  );

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

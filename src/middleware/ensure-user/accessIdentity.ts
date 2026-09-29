import type { JWTPayload } from "jose";

type AccessIdentity = { userId: string; userEmail: string };

/**
 * Who a verified Cloudflare Access token belongs to.
 *
 * A person signing in through Access carries `sub` and `email`. A Cloudflare
 * Access service token (machine-to-machine: `CF-Access-Client-Id` /
 * `CF-Access-Client-Secret`) carries neither — only `common_name`, its client
 * id. Service tokens are accepted only when the deployment opts in
 * (`ACCESS_ALLOW_SERVICE_TOKENS=true`). Access itself is the allowlist: it only
 * issues a token for this application's audience when one of the
 * application's policies admits that service token, and the caller has
 * already verified issuer and audience. Each service token becomes one stable
 * service user in the shared workspace.
 */
export function identityFromAccessPayload(
  payload: JWTPayload,
  allowServiceTokens: boolean,
): AccessIdentity | null {
  const userId = typeof payload.sub === "string" ? payload.sub : "";
  const userEmail = typeof payload.email === "string" ? payload.email : "";
  if (userId && userEmail) {
    return { userId, userEmail };
  }

  const commonName =
    typeof payload.common_name === "string" ? payload.common_name.trim() : "";
  if (
    allowServiceTokens &&
    !userId &&
    !userEmail &&
    /^[A-Za-z0-9._-]{1,128}$/.test(commonName)
  ) {
    return {
      userId: `access-service-token:${commonName}`,
      userEmail: `${commonName}@service-token.invalid`,
    };
  }

  return null;
}

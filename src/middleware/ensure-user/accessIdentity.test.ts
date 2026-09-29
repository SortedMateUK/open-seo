import { describe, expect, it } from "vitest";
import { identityFromAccessPayload } from "./accessIdentity";

const person = { sub: "0a1b2c", email: "josh@example.com" };
const serviceToken = { sub: "", common_name: "2f4c9e.access", type: "app" };

describe("identityFromAccessPayload", () => {
  it("a person is their sub and email, whether or not service tokens are allowed", () => {
    expect(identityFromAccessPayload(person, false)).toEqual({
      userId: "0a1b2c",
      userEmail: "josh@example.com",
    });
    expect(identityFromAccessPayload(person, true)).toEqual({
      userId: "0a1b2c",
      userEmail: "josh@example.com",
    });
  });

  it("a service token is refused unless the deployment opts in", () => {
    expect(identityFromAccessPayload(serviceToken, false)).toBeNull();
  });

  it("with the opt-in, a service token is one stable service user", () => {
    expect(identityFromAccessPayload(serviceToken, true)).toEqual({
      userId: "access-service-token:2f4c9e.access",
      userEmail: "2f4c9e.access@service-token.invalid",
    });
  });

  it("anything else is refused: no identity, half an identity, or an odd common name", () => {
    expect(identityFromAccessPayload({}, true)).toBeNull();
    expect(identityFromAccessPayload({ sub: "0a1b2c" }, true)).toBeNull();
    expect(
      identityFromAccessPayload({ email: "josh@example.com" }, true),
    ).toBeNull();
    expect(
      identityFromAccessPayload(
        { sub: "x", common_name: "2f4c9e.access" },
        true,
      ),
    ).toBeNull();
    expect(
      identityFromAccessPayload({ common_name: "a b@c" }, true),
    ).toBeNull();
    expect(
      identityFromAccessPayload({ common_name: "x".repeat(129) }, true),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  parseServiceTokenIds,
  serviceTokenAccess,
} from "../deploy/alchemy/alchemy.access";

describe("parseServiceTokenIds", () => {
  it("empty means no service tokens", () => {
    expect(parseServiceTokenIds("")).toEqual([]);
    expect(parseServiceTokenIds(" , ")).toEqual([]);
  });

  it("reads comma-separated Access service token ids", () => {
    expect(
      parseServiceTokenIds(
        " 3fa85f64-5717-4562-b3fc-2c963f66afa6 ,6b1f0d3e-0000-4000-8000-00000000000a",
      ),
    ).toEqual([
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "6b1f0d3e-0000-4000-8000-00000000000a",
    ]);
  });

  it("refuses a client id or anything else in place of a token id", () => {
    expect(() => parseServiceTokenIds("2f4c9e.access")).toThrow(/UUIDs/);
    expect(() =>
      parseServiceTokenIds("3fa85f64-5717-4562-b3fc-2c963f66afa6,nope"),
    ).toThrow(/nope/);
  });
});

describe("serviceTokenAccess", () => {
  const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("opts the app in when token ids are listed", () => {
    expect(serviceTokenAccess(id, "")).toEqual({
      serviceTokenIds: [id],
      allowServiceTokens: true,
    });
  });

  it("opts in with only the flag, for a self-managed Access application", () => {
    expect(serviceTokenAccess("", "true").allowServiceTokens).toBe(true);
  });

  it("stays off by default", () => {
    expect(serviceTokenAccess("", "").allowServiceTokens).toBe(false);
  });
});

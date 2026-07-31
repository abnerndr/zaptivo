import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("proxy (Auth.js)", () => {
  it("wires NextAuth authConfig as default export", () => {
    const src = readFileSync(join(__dirname, "proxy.ts"), "utf8");
    expect(src).toContain("authConfig");
    expect(src).toContain("export default NextAuth(authConfig).auth");
  });
});

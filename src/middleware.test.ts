import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("middleware (Auth.js)", () => {
  it("wires NextAuth authConfig as default export", () => {
    const src = readFileSync(join(__dirname, "middleware.ts"), "utf8");
    expect(src).toContain("authConfig");
    expect(src).toContain("export default NextAuth(authConfig).auth");
  });
});

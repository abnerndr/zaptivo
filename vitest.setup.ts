import { vi } from "vitest";

vi.mock("next/server", () => {
  class NextResponse extends Response {
    static json(data: unknown, init?: ResponseInit) {
      const headers = new Headers(init?.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return new NextResponse(JSON.stringify(data), {
        ...init,
        headers,
      });
    }
  }
  return { NextResponse };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

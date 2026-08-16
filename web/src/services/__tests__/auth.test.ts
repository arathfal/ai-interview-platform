import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "@/services/auth";

// Mock the axios instance — we only assert the outgoing request shape.
vi.mock("@/services/api", () => ({
  default: { post: vi.fn(() => Promise.resolve({ data: { token: "tok" } })) },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authApi.login (F-03 — tenant-explicit header)", () => {
  it("sends X-Tenant-Scheme header with the given scheme", async () => {
    const api = (await import("@/services/api")).default;
    const postMock = api.post as ReturnType<typeof vi.fn>;

    await authApi.login({ email: "a@b.c", password: "secret" }, "test-corp");

    expect(postMock).toHaveBeenCalledWith(
      "/auth/login",
      { email: "a@b.c", password: "secret" },
      { headers: { "X-Tenant-Scheme": "test-corp" } }
    );
  });

  it("passes through the exact scheme string (no trimming/mutation at service layer)", async () => {
    const api = (await import("@/services/api")).default;
    const postMock = api.post as ReturnType<typeof vi.fn>;

    await authApi.login({ email: "a@b.c", password: "secret" }, "Alpha-Corp ");

    const { headers } = postMock.mock.calls[0][2];
    expect(headers["X-Tenant-Scheme"]).toBe("Alpha-Corp ");
  });
});
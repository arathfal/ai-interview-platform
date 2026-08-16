import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/pages/auth/LoginPage";
import { authApi } from "@/services/auth";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/services/auth", () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
  },
}));

const loginMock = authApi.login as ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigateMock.mockReset();
  loginMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LoginPage — tenant-explicit login (F-03)", () => {
  it("renders a Tenant field with a placeholder", () => {
    renderLogin();
    const tenantInput = screen.getByLabelText(/tenant/i);
    expect(tenantInput).toBeInTheDocument();
    expect(tenantInput).toHaveAttribute("placeholder", "e.g. test-corp");
  });

  it("toggles password visibility with the eye icon (UXI polish)", async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("blocks submit when tenant is empty — no request, inline error under the Tenant field (AC#5)", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "a@b.c");
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).not.toHaveBeenCalled();
    // error replaces the helper info (error ?? info)
    expect(await screen.findByText("Tenant is required.")).toBeInTheDocument();
    expect(
      screen.queryByText(/organization scheme — provided by your assessor/i)
    ).not.toBeInTheDocument();
    // typing again clears the inline tenant error and restores helper info
    await user.type(screen.getByLabelText(/tenant/i), "t");
    expect(screen.queryByText("Tenant is required.")).not.toBeInTheDocument();
    expect(
      screen.getByText(/organization scheme — provided by your assessor/i)
    ).toBeInTheDocument();
  });

  it("sends the tenant scheme with login and navigates on success", async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ data: { token: "tok123" } });
    renderLogin();

    await user.type(screen.getByLabelText(/tenant/i), "test-corp");
    await user.type(screen.getByLabelText(/email/i), "assessor@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        { email: "assessor@test.corp", password: "Password123!" },
        "test-corp"
      );
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/assessments"));
    expect(localStorage.getItem("auth_token")).toBe("tok123");
  });

  it("surfaces the backend error message instead of a generic one (AC#8)", async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue({
      response: { data: { errors: [{ message: "Unknown tenant scheme" }] } },
    });
    renderLogin();

    await user.type(screen.getByLabelText(/tenant/i), "nope");
    await user.type(screen.getByLabelText(/email/i), "assessor@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Unknown tenant scheme")).toBeInTheDocument();
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });

  it("falls back to a generic message when the error has no backend envelope", async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new Error("network down"));
    renderLogin();

    await user.type(screen.getByLabelText(/tenant/i), "test-corp");
    await user.type(screen.getByLabelText(/email/i), "assessor@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });
});

describe("LoginPage — dev default tenant scheme (AC#6)", () => {
  it("pre-fills the Tenant field from VITE_DEV_TENANT_SCHEME when set", async () => {
    vi.stubEnv("VITE_DEV_TENANT_SCHEME", "dev-corp");
    vi.resetModules();
    const { default: LoginPageFresh } = await import("@/pages/auth/LoginPage");

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPageFresh />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/tenant/i)).toHaveValue("dev-corp");
  });
});
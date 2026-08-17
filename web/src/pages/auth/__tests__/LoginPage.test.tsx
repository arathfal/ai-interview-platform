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

describe("LoginPage — tenant-implicit login (F-03 phase 2)", () => {
  it("renders email + password only — no tenant field", () => {
    renderLogin();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/tenant/i)).not.toBeInTheDocument();
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

  it("sends email + password only and navigates on success (clean login, no scheme)", async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ data: { token: "tok123" } });
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "assessor@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ email: "assessor@test.corp", password: "Password123!" });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/assessments"));
    expect(localStorage.getItem("auth_token")).toBe("tok123");
  });

  it("surfaces the backend error (e.g. account not assigned) instead of a generic one", async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue({
      response: { data: { errors: [{ message: "Account is not assigned to an organization" }] } },
    });
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "assessor@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Account is not assigned to an organization")).toBeInTheDocument();
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });

  it("falls back to a generic message when the error has no backend envelope", async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new Error("network down"));
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "assessor@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("shows the signup CTA below the button linking to /signup (AC#7)", () => {
    renderLogin();

    const cta = screen.getByRole("link", { name: /sign up/i });
    expect(cta).toHaveAttribute("href", "/signup");
  });
});
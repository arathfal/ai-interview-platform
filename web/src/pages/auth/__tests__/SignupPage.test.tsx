import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignUpPage from "@/pages/auth/SignupPage";
import { authApi } from "@/services/auth";
import { organizationsApi } from "@/services/organizations";

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

vi.mock("@/services/organizations", () => ({
  organizationsApi: {
    list: vi.fn(),
  },
}));

const signupMock = authApi.signup as ReturnType<typeof vi.fn>;
const listMock = organizationsApi.list as ReturnType<typeof vi.fn>;

const ORGS = [
  { id: 1, name: "Tenant A", scheme: "tenant-a" },
  { id: 2, name: "Tenant B", scheme: "tenant-b" },
];

beforeEach(() => {
  navigateMock.mockReset();
  signupMock.mockReset();
  listMock.mockReset();
  // Radix Select needs pointer/scroll polyfills that jsdom lacks.
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function selectOrg(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("combobox", { name: /organization/i }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("SignUpPage — organization dropdown signup (F-03 phase 2)", () => {
  it("toggles password visibility with the eye icon (shared PasswordInput)", async () => {
    listMock.mockResolvedValue({ data: { organizations: ORGS } });
    renderSignup();

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("renders the organization dropdown populated from GET /organizations", async () => {
    listMock.mockResolvedValue({ data: { organizations: ORGS } });
    renderSignup();

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /organization/i }));
    expect(await screen.findByRole("option", { name: "Tenant A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tenant B" })).toBeInTheDocument();
  });

  it("blocks submit until an organization is selected (inline error, no request)", async () => {
    listMock.mockResolvedValue({ data: { organizations: ORGS } });
    renderSignup();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "new@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText("Please select an organization.")).toBeInTheDocument();
    expect(signupMock).not.toHaveBeenCalled();
  });

  it("submits with the chosen organization_id and navigates on success", async () => {
    listMock.mockResolvedValue({ data: { organizations: ORGS } });
    signupMock.mockResolvedValue({ data: { token: "tok123" } });
    renderSignup();

    const user = userEvent.setup();
    await selectOrg(user, "Tenant B");
    await user.type(screen.getByLabelText(/email/i), "new@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(signupMock).toHaveBeenCalledWith({
        email: "new@test.corp",
        password: "Password123!",
        role: "user",
        organization_id: 2,
      });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/assessments"));
    expect(localStorage.getItem("auth_token")).toBe("tok123");
  });

  it("surfaces the backend error (e.g. duplicate email) instead of a generic one", async () => {
    listMock.mockResolvedValue({ data: { organizations: ORGS } });
    signupMock.mockRejectedValue({
      response: { data: { errors: [{ message: "Email has already been taken" }] } },
    });
    renderSignup();

    const user = userEvent.setup();
    await selectOrg(user, "Tenant A");
    await user.type(screen.getByLabelText(/email/i), "taken@test.corp");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText("Email has already been taken")).toBeInTheDocument();
  });

  it("shows a message and disables submit when no organizations exist", async () => {
    listMock.mockResolvedValue({ data: { organizations: [] } });
    renderSignup();

    expect(
      await screen.findByText(/no organizations available\. please contact your assessor/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeDisabled();
  });

  it("shows an error when the organization listing fails to load", async () => {
    listMock.mockRejectedValue(new Error("network down"));
    renderSignup();

    expect(
      await screen.findByText("Failed to load organizations. Please try again.")
    ).toBeInTheDocument();
  });
});
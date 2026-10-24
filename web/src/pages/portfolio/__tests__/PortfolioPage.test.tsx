import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioPage from "@/pages/portfolio/PortfolioPage";
import { sessionsApi } from "@/services/sessions";

vi.mock("@/services/sessions", () => ({
  sessionsApi: {
    getPortfolio: vi.fn(),
    get: vi.fn(),
    regeneratePortfolio: vi.fn(),
  },
}));

vi.mock("@/services/vacancies", () => ({
  vacanciesApi: { list: vi.fn(() => Promise.resolve({ data: { vacancies: [] } })) },
}));

vi.mock("@/services/portfolios", () => ({
  portfoliosApi: { exportPortfolio: vi.fn() },
}));

vi.mock("@/hooks/usePolling", () => ({
  usePolling: vi.fn(),
}));

const getPortfolioMock = sessionsApi.getPortfolio as ReturnType<typeof vi.fn>;
const getSessionMock = sessionsApi.get as ReturnType<typeof vi.fn>;
const regeneratePortfolioMock = sessionsApi.regeneratePortfolio as ReturnType<typeof vi.fn>;

const failedPortfolio = {
  id: 19,
  session_id: 23,
  generation_status: "failed" as const,
  generation_error: "Generation failed",
  skills: [],
  overrides: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ data: { session: { candidate_name: "Budi Santoso" } } });
  regeneratePortfolioMock.mockResolvedValue({ data: { message: "queued", portfolio: failedPortfolio } });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/assessments/10/sessions/23/portfolio"]}>
      <Routes>
        <Route path="/assessments/:id/sessions/:sessionId/portfolio" element={<PortfolioPage />} />
        <Route path="/assessments/:id/edit" element={<p>Edit assessment page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PortfolioPage — generation failure recovery", () => {
  it("directs an invalid empty assessment to configuration instead of offering a futile retry", async () => {
    getPortfolioMock.mockResolvedValue({
      data: { portfolio: { ...failedPortfolio, failure_reason: "missing_assessment_skills" } },
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("This assessment has no skills to evaluate");
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /edit assessment/i }));
    expect(await screen.findByText("Edit assessment page")).toBeInTheDocument();
  });

  it("keeps retry available for recoverable generation failures", async () => {
    getPortfolioMock.mockResolvedValue({
      data: { portfolio: { ...failedPortfolio, failure_reason: "generation_failed" } },
    });

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(regeneratePortfolioMock).toHaveBeenCalledWith(23);
    });
    expect(screen.getByText("Generating portfolio...")).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import InterviewPage from "@/pages/interview/InterviewPage";
import { sessionsApi } from "@/services/sessions";

vi.mock("@/services/sessions", () => ({
  sessionsApi: {
    getCandidateInfo: vi.fn(),
    audioComplete: vi.fn(),
  },
}));

vi.mock("@/hooks/useAudioWebSocket", () => ({
  useAudioWebSocket: () => ({
    connect: vi.fn(),
    send: vi.fn(),
    sendJson: vi.fn(),
    disconnect: vi.fn(),
    connectionState: "disconnected",
  }),
}));

vi.mock("@/hooks/useAudioCapture", () => ({
  useAudioCapture: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    isCapturing: false,
  }),
}));

vi.mock("@/hooks/useAudioPlayback", () => ({
  useAudioPlayback: () => ({
    playChunk: vi.fn(),
    stop: vi.fn(),
    scheduleAfterPlayback: vi.fn(),
    waitForDrain: vi.fn(),
    cancelDrain: vi.fn(),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderInterview(token = "tok123") {
  return render(
    <MemoryRouter initialEntries={[`/interview/${token}`]}>
      <Routes>
        <Route path="/interview/:token" element={<InterviewPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("InterviewPage — failure paths (F-07)", () => {
  it("renders load-failure error with retry when fetch fails (network error)", async () => {
    (sessionsApi.getCandidateInfo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network down")
    );

    renderInterview();

    expect(await screen.findByRole("heading", { name: "Couldn't load your interview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("renders auth-failed error WITHOUT retry for 401/404", async () => {
    (sessionsApi.getCandidateInfo as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 404 },
    });

    renderInterview();

    expect(await screen.findByRole("heading", { name: "This interview link isn't valid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/i })).not.toBeInTheDocument();
  });

  it("retry re-runs the fetch after a load failure", async () => {
    const mock = sessionsApi.getCandidateInfo as ReturnType<typeof vi.fn>;
    mock.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({
      data: { session_id: 7, role_title: "Backend Engineer", time_limit_min: 30, session_status: "pending" },
    });

    renderInterview();

    // First attempt fails → error screen.
    expect(await screen.findByRole("heading", { name: "Couldn't load your interview" })).toBeInTheDocument();

    const userEventModule = await import("@testing-library/user-event");
    const user = userEventModule.default.setup();
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    // After a successful retry, the pre-start screen shows role title + Start.
    await screen.findByText("Backend Engineer");
    expect(screen.getByRole("button", { name: /Start Interview/i })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("shows the pre-start (idle) screen when the fetch succeeds", async () => {
    (sessionsApi.getCandidateInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session_id: 1, role_title: "Data Analyst", time_limit_min: 20, session_status: "pending" },
    });

    renderInterview();

    await waitFor(() => {
      expect(screen.getByText("Data Analyst")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Start Interview/i })).toBeInTheDocument();
  });
});
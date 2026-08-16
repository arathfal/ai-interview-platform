import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HardwareCheck from "@/components/HardwareCheck";
import { testInternetSpeed, DEFAULT_THRESHOLDS } from "@/utils/internetSpeedTest";
import type { InternetSpeedResult } from "@/utils/internetSpeedTest";

vi.mock("@/utils/internetSpeedTest", () => ({
    testInternetSpeed: vi.fn(),
    DEFAULT_THRESHOLDS: { minDownloadMbps: 8, minUploadMbps: 4, maxPingMs: 300 },
}));

const mockSpeed = testInternetSpeed as ReturnType<typeof vi.fn>;

function speedResult(overrides: Partial<InternetSpeedResult> = {}): InternetSpeedResult {
    return {
        download: 25,
        upload: 12,
        ping: 40,
        passed: true,
        unavailable: false,
        downloadTests: [25, 26, 24],
        uploadTests: [12, 13, 11],
        pingTests: [40, 41, 39],
        ...overrides,
    };
}

class FakeAnalyser {
    fftSize = 256;
    frequencyBinCount = 32;
    getByteFrequencyData(data: Uint8Array) {
        data.fill(0);
    }
}

class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    createOscillator = () => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
    });
    createGain = () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn() },
    });
    createMediaStreamSource = () => ({ connect: vi.fn() });
    createAnalyser = () => new FakeAnalyser();
}

const fakeStream = { getTracks: () => [] } as unknown as MediaStream;

beforeEach(() => {
    mockSpeed.mockReset();
    mockSpeed.mockResolvedValue(speedResult());
    Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
        configurable: true,
    });
    vi.stubGlobal("AudioContext", FakeAudioContext);
    // The mic level monitor schedules itself via requestAnimationFrame; noop it in jsdom
    // (otherwise it loops forever and keeps the test's event loop busy).
    vi.stubGlobal("requestAnimationFrame", () => 0);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

async function waitForStartEnabled() {
    await waitFor(
        () => expect(screen.getByRole("button", { name: /Start Interview/i })).toBeEnabled(),
        { timeout: 4000 }
    );
}

describe("HardwareCheck — internet check (F-13)", () => {
    it("proceeds normally when the speed test passes", async () => {
        render(<HardwareCheck onStart={vi.fn()} />);

        // OS & browser step completes after ~800ms, then the internet check runs.
        await screen.findByText("↓ 25 Mbps", {}, { timeout: 4000 });
        expect(screen.getAllByText("Passed").length).toBeGreaterThanOrEqual(2);
        await waitForStartEnabled();
    });

    it("skips the internet check with a warning when the speed test is unavailable, and still allows starting", async () => {
        mockSpeed.mockResolvedValue(
            speedResult({ passed: false, unavailable: true, download: 0, upload: 0, ping: 999 })
        );

        render(<HardwareCheck onStart={vi.fn()} />);

        await screen.findByText(/Speed test unavailable/, {}, { timeout: 4000 });
        expect(screen.getByText("Skipped")).toBeInTheDocument();
        // No fabricated speed numbers for an unmeasurable connection.
        expect(screen.queryByText(/Mbps/)).not.toBeInTheDocument();
        await waitForStartEnabled();
    });

    it("blocks start when internet is measured below threshold (not unavailable)", async () => {
        mockSpeed.mockResolvedValue(
            speedResult({ passed: false, unavailable: false, download: 1.2, upload: 0.8, ping: 500 })
        );

        render(<HardwareCheck onStart={vi.fn()} />);

        await screen.findByText("Failed", {}, { timeout: 4000 });
        expect(screen.queryByText(/Speed test unavailable/)).not.toBeInTheDocument();
        // Chain stops at internet → camera/mic never load → start stays disabled, retry offered.
        expect(screen.getByRole("button", { name: /Start Interview/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });
});

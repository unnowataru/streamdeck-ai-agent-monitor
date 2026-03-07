import type { ApiCredentials, MetricData } from "@ai-monitor/shared";
import { fetchClaudeMetrics } from "./providers/claude.js";
import { fetchXaiMetrics } from "./providers/xai.js";
import { fetchCodexMetrics } from "./providers/codex.js";

const DEFAULT_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS       = 30 * 60_000; // 30 min cap

type MetricsCallback = (data: MetricData) => void;

export class Poller {
    private credentials  = new Map<string, ApiCredentials>();
    private timers       = new Map<string, ReturnType<typeof setInterval>>();
    private errorCounts  = new Map<string, number>();
    private readonly intervalMs: number;
    private readonly onMetrics: MetricsCallback;

    constructor(onMetrics: MetricsCallback, intervalMs = DEFAULT_INTERVAL_MS) {
        this.onMetrics = onMetrics;
        this.intervalMs = intervalMs;
    }

    setCredentials(creds: ApiCredentials): void {
        this.credentials.set(creds.provider, creds);
        this.startPolling(creds.provider);
    }

    private startPolling(provider: string): void {
        const existing = this.timers.get(provider);
        if (existing) clearInterval(existing);

        void this.poll(provider);
        const timer = setInterval(() => void this.poll(provider), this.intervalMs);
        this.timers.set(provider, timer);
    }

    /** Replace the current timer for a provider with a new one at `delay` ms. */
    private reschedule(provider: string, delay: number): void {
        const existing = this.timers.get(provider);
        if (existing) clearInterval(existing);
        const timer = setInterval(() => void this.poll(provider), delay);
        this.timers.set(provider, timer);
    }

    private async poll(provider: string): Promise<void> {
        const creds = this.credentials.get(provider);
        let metrics: MetricData;

        try {
            if (provider === "claude" && creds?.provider === "claude") {
                metrics = await fetchClaudeMetrics(creds.api_key);
            } else if (provider === "xai" && creds?.provider === "xai") {
                metrics = await fetchXaiMetrics(creds.api_key, creds.team_id ?? "");
            } else if (provider === "codex") {
                metrics = await fetchCodexMetrics();
            } else {
                return;
            }
        } catch {
            // Unexpected throw not caught by the provider — apply backoff without emitting metrics.
            const n = (this.errorCounts.get(provider) ?? 0) + 1;
            this.errorCounts.set(provider, n);
            this.reschedule(provider, Math.min(this.intervalMs * Math.pow(2, n), MAX_BACKOFF_MS));
            return;
        }

        this.onMetrics(metrics);

        if (metrics.status === "error") {
            // Provider returned a structured error — back off to avoid hammering a failing API.
            const n = (this.errorCounts.get(provider) ?? 0) + 1;
            this.errorCounts.set(provider, n);
            this.reschedule(provider, Math.min(this.intervalMs * Math.pow(2, n), MAX_BACKOFF_MS));
        } else if (this.errorCounts.has(provider)) {
            // Recovery: reset error count and return to normal polling interval.
            this.errorCounts.delete(provider);
            this.reschedule(provider, this.intervalMs);
        }
    }

    pollAll(): void {
        for (const provider of this.credentials.keys()) {
            void this.poll(provider);
        }
    }

    pause(): void {
        this.stopAll();
    }

    resume(): void {
        for (const provider of this.credentials.keys()) {
            this.startPolling(provider);
        }
    }

    stopAll(): void {
        for (const timer of this.timers.values()) {
            clearInterval(timer);
        }
        this.timers.clear();
    }
}

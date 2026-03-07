import type { ApiCredentials, MetricData } from "@ai-monitor/shared";
import { fetchClaudeMetrics } from "./providers/claude.js";
import { fetchXaiMetrics } from "./providers/xai.js";
import { fetchCodexMetrics } from "./providers/codex.js";

const DEFAULT_INTERVAL_MS = 60_000;

type MetricsCallback = (data: MetricData) => void;

export class Poller {
    private credentials = new Map<string, ApiCredentials>();
    private timers = new Map<string, ReturnType<typeof setInterval>>();
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

    private async poll(provider: string): Promise<void> {
        const creds = this.credentials.get(provider);
        let metrics: MetricData;

        if (provider === "claude" && creds?.provider === "claude") {
            metrics = await fetchClaudeMetrics(creds.api_key);
        } else if (provider === "xai" && creds?.provider === "xai") {
            metrics = await fetchXaiMetrics(creds.api_key, creds.team_id ?? "");
        } else if (provider === "codex") {
            metrics = await fetchCodexMetrics();
        } else {
            return;
        }

        this.onMetrics(metrics);
    }

    stopAll(): void {
        for (const timer of this.timers.values()) {
            clearInterval(timer);
        }
        this.timers.clear();
    }
}

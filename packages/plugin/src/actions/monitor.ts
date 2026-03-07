import streamDeck, {
    action,
    SingletonAction,
    type Bar,
    type DialAction,
    type DialDownEvent,
    type DialRotateEvent,
    type FeedbackPayload,
    type Text,
    type TouchTapEvent,
    type WillAppearEvent,
} from "@elgato/streamdeck";
import type { MetricData, QuotaStatus } from "@ai-monitor/shared";

const PROVIDERS = ["claude", "xai", "codex"] as const;
type Provider = (typeof PROVIDERS)[number];

/** "minimal" = % only  |  "detail" = % + remaining value + reset time */
type ViewMode = "minimal" | "detail";

/** Status → hex color for bar fill and percent text */
const STATUS_COLOR: Record<QuotaStatus, string> = {
    normal:   "#4caf50",  // green
    warning:  "#ff9800",  // amber
    critical: "#f44336",  // red
    error:    "#f44336",  // red
    unknown:  "#9e9e9e",  // gray
};

@action({ UUID: "com.antigravity.aimonitor.monitor" })
export class MonitorAction extends SingletonAction {
    private currentProviderIndex = 0;
    private currentView: ViewMode = "minimal";
    private latestMetrics: Partial<Record<Provider, MetricData>> = {};

    private get currentProvider(): Provider {
        return PROVIDERS[this.currentProviderIndex];
    }

    /** Called by plugin.ts whenever the collector sends METRICS_UPDATE. */
    updateMetrics(data: MetricData): void {
        this.latestMetrics[data.provider] = data;
        if (data.provider === this.currentProvider) {
            void this.renderAll();
        }
    }

    onWillAppear(_ev: WillAppearEvent): void {
        void this.renderAll();
    }

    /** Dial press → cycle providers. */
    onDialDown(_ev: DialDownEvent): void {
        this.currentProviderIndex = (this.currentProviderIndex + 1) % PROVIDERS.length;
        streamDeck.logger.info(`[monitor] provider → ${this.currentProvider}`);
        void this.renderAll();
    }

    /** Dial rotate → toggle view mode. */
    onDialRotate(_ev: DialRotateEvent): void {
        this.currentView = this.currentView === "minimal" ? "detail" : "minimal";
        void this.renderAll();
    }

    /** Touch tap → force immediate re-render. */
    onTouchTap(_ev: TouchTapEvent): void {
        void this.renderAll();
    }

    private async renderAll(): Promise<void> {
        const metrics  = this.latestMetrics[this.currentProvider];
        const feedback = buildFeedback(this.currentProvider, this.currentView, metrics);
        const nextProvider = PROVIDERS[(this.currentProviderIndex + 1) % PROVIDERS.length];

        for (const act of this.actions) {
            if (isDialAction(act)) {
                await act.setFeedback(feedback);
                await act.setTriggerDescription({
                    rotate: this.currentView === "minimal" ? "Show detail" : "Show minimal",
                    push:   `Switch to ${nextProvider.toUpperCase()}`,
                    touch:  "Refresh",
                });
            }
        }
    }
}

// ---- helpers ----------------------------------------------------------------

function isDialAction(act: unknown): act is DialAction {
    return typeof act === "object" && act !== null && "setFeedback" in act;
}

function buildFeedback(
    provider: Provider,
    view: ViewMode,
    metrics: MetricData | undefined,
): FeedbackPayload {
    const status  = metrics?.status ?? "unknown";
    const percent = metrics?.remaining_percent ?? null;
    const color   = STATUS_COLOR[status];

    // Large % number — slightly smaller in detail mode to leave room for sub-line
    const percentItem: Text = {
        value: percent !== null ? `${percent}%` : "--",
        color,
        font: { size: view === "minimal" ? 40 : 28, weight: 700 },
    };

    // Progress bar with dynamic fill color
    const barItem: Bar = {
        value: percent ?? 0,
        bar_fill_c: color,
    };

    // Secondary label: status badge (minimal) or remaining value (detail)
    const statusValue =
        view === "minimal"
            ? statusBadge(status)
            : formatRemainingValue(metrics);

    // Bottom line: empty (minimal) or reset time (detail)
    const resetValue =
        view === "detail" && metrics?.reset_at
            ? `Reset ${formatResetTime(metrics.reset_at)}`
            : "";

    return {
        provider: provider.toUpperCase(),
        status:   statusValue,
        percent:  percentItem,
        bar:      barItem,
        reset:    resetValue,
    };
}

function statusBadge(status: QuotaStatus): string {
    const labels: Record<QuotaStatus, string> = {
        normal:   "",
        warning:  "LOW",
        critical: "CRITICAL",
        error:    "ERROR",
        unknown:  "---",
    };
    return labels[status];
}

/**
 * Human-readable remaining value for the detail view.
 * - currency → "$4.50 left"
 * - count    → "270 / 300 tkn"  (or just "90,000 tkn" when no total)
 */
function formatRemainingValue(metrics: MetricData | undefined): string {
    if (!metrics || metrics.remaining_value === null) return "";

    if (metrics.budget_type === "currency") {
        return `$${metrics.remaining_value.toFixed(2)} left`;
    }

    const rem = Math.round(metrics.remaining_value).toLocaleString();
    if (metrics.total_budget !== null) {
        const tot = Math.round(metrics.total_budget).toLocaleString();
        return `${rem} / ${tot} tkn`;
    }
    return `${rem} tkn`;
}

function formatResetTime(isoString: string): string {
    try {
        return new Date(isoString).toLocaleTimeString("en-GB", {
            hour:   "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    } catch {
        return isoString;
    }
}

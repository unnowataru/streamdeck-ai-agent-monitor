import streamDeck, {
    action,
    SingletonAction,
    type DialDownEvent,
    type DialRotateEvent,
    type TouchTapEvent,
    type WillAppearEvent,
    type DialAction,
} from "@elgato/streamdeck";
import type { MetricData } from "@ai-monitor/shared";

const PROVIDERS = ["claude", "xai", "codex"] as const;
type Provider = (typeof PROVIDERS)[number];

/** View mode: "minimal" shows only %, "detail" adds reset time */
type ViewMode = "minimal" | "detail";

@action({ UUID: "com.antigravity.aimonitor.monitor" })
export class MonitorAction extends SingletonAction {
    private currentProviderIndex = 0;
    private currentView: ViewMode = "minimal";
    private latestMetrics: Partial<Record<Provider, MetricData>> = {};

    private get currentProvider(): Provider {
        return PROVIDERS[this.currentProviderIndex];
    }

    /** Called by plugin.ts whenever the collector sends METRICS_UPDATE */
    updateMetrics(data: MetricData): void {
        this.latestMetrics[data.provider] = data;
        if (data.provider === this.currentProvider) {
            void this.renderAll();
        }
    }

    /** Render when action becomes visible */
    onWillAppear(_ev: WillAppearEvent): void {
        void this.renderAll();
    }

    /** Dial press → cycle through providers */
    onDialDown(_ev: DialDownEvent): void {
        this.currentProviderIndex = (this.currentProviderIndex + 1) % PROVIDERS.length;
        streamDeck.logger.info(`[monitor] provider switched to ${this.currentProvider}`);
        void this.renderAll();
    }

    /** Dial rotate → toggle view mode (minimal ↔ detail) */
    onDialRotate(_ev: DialRotateEvent): void {
        this.currentView = this.currentView === "minimal" ? "detail" : "minimal";
        void this.renderAll();
    }

    /** Touch tap → force refresh of current provider */
    onTouchTap(_ev: TouchTapEvent): void {
        void this.renderAll();
    }

    private async renderAll(): Promise<void> {
        const metrics = this.latestMetrics[this.currentProvider];
        const feedback = buildFeedback(this.currentProvider, this.currentView, metrics);

        for (const act of this.actions) {
            if (isDialAction(act)) {
                await act.setFeedback(feedback);
            }
        }
    }
}

function isDialAction(act: unknown): act is DialAction {
    return typeof act === "object" && act !== null && "setFeedback" in act;
}

function buildFeedback(
    provider: Provider,
    view: ViewMode,
    metrics: MetricData | undefined
): Record<string, string | number> {
    const percent = metrics?.remaining_percent ?? null;
    const status = metrics?.status ?? "unknown";

    const statusLabel = {
        normal: "",
        warning: "LOW",
        critical: "CRITICAL",
        unknown: "---",
        error: "ERROR",
    }[status];

    const resetLabel =
        view === "detail" && metrics?.reset_at
            ? `Reset ${formatResetTime(metrics.reset_at)}`
            : "";

    return {
        provider: provider.toUpperCase(),
        status: statusLabel,
        percent: percent !== null ? `${percent}%` : "--",
        bar: percent ?? 0,
        reset: resetLabel,
    };
}

function formatResetTime(isoString: string): string {
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return isoString;
    }
}

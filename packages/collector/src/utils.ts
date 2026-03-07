import type { QuotaStatus } from "@ai-monitor/shared";

export function computeStatus(remainingPercent: number | null): QuotaStatus {
    if (remainingPercent === null) return "unknown";
    if (remainingPercent <= 10) return "critical";
    if (remainingPercent <= 25) return "warning";
    return "normal";
}

export function computePercent(remaining: number | null, total: number | null): number | null {
    if (remaining === null || total === null || total === 0) return null;
    return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}

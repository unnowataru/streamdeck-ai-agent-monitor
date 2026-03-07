import axios from "axios";
import type { MetricData } from "@ai-monitor/shared";
import { computeStatus, computePercent } from "../utils.js";

interface FetchConfig {
    headers?: Record<string, string>;
}
interface FetchResponse {
    headers: Record<string, string | undefined>;
    data: unknown;
}
export type HttpGetFn = (url: string, config?: FetchConfig) => Promise<FetchResponse>;

const defaultGet: HttpGetFn = async (url, config) => {
    const res = await axios.get(url, config);
    return {
        headers: res.headers as Record<string, string | undefined>,
        data: res.data,
    };
};

// Response shape from xAI billing endpoint.
// total.val is a string of USD cents (e.g. "-500" means $5.00 consumed or overdrawn).
interface XaiBillingResponse {
    total?: { val?: string };
    hard_limit?: { val?: string };
}

export async function fetchXaiMetrics(
    apiKey: string,
    teamId: string,
    httpGet: HttpGetFn = defaultGet
): Promise<MetricData> {
    const now = new Date().toISOString();
    try {
        const res = await httpGet(
            `https://api.x.ai/v1/billing/teams/${teamId}/prepaid/balance`,
            {
                headers: { Authorization: `Bearer ${apiKey}` },
            }
        );

        const body = res.data as XaiBillingResponse;
        const remainingCents = parseInt(body.total?.val ?? "0", 10);
        const hardLimitCents = parseInt(body.hard_limit?.val ?? "0", 10);

        // Cents → dollars
        const remainingDollars = remainingCents / 100;
        const totalDollars = hardLimitCents > 0 ? hardLimitCents / 100 : null;
        const remainingPercent = computePercent(remainingCents, hardLimitCents || null);

        return {
            provider: "xai",
            status: computeStatus(remainingPercent),
            budget_type: "currency",
            remaining_value: remainingDollars,
            total_budget: totalDollars,
            remaining_percent: remainingPercent,
            reset_at: null,
            fetched_at: now,
        };
    } catch (err: unknown) {
        return {
            provider: "xai",
            status: "error",
            budget_type: "currency",
            remaining_value: null,
            total_budget: null,
            remaining_percent: null,
            reset_at: null,
            fetched_at: now,
            error_message: err instanceof Error ? err.message : String(err),
        };
    }
}

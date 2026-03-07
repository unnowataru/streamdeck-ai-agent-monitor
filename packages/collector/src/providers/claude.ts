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

// Admin API: fetch organization token usage
async function fetchAdminMetrics(apiKey: string, httpGet: HttpGetFn): Promise<MetricData> {
    const now = new Date().toISOString();
    try {
        const res = await httpGet(
            "https://api.anthropic.com/v1/organizations/usage_report/messages",
            {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                },
            }
        );
        const body = res.data as {
            data?: { input_tokens?: number; output_tokens?: number };
        };
        const inputTokens = body.data?.input_tokens ?? 0;
        const outputTokens = body.data?.output_tokens ?? 0;
        const totalUsed = inputTokens + outputTokens;

        return {
            provider: "claude",
            status: "normal",
            budget_type: "count",
            remaining_value: null,
            total_budget: null,
            remaining_percent: null,
            reset_at: null,
            fetched_at: now,
            // Surface usage in error_message field until we know the org limit
            error_message: `Used: ${totalUsed.toLocaleString()} tokens (in=${inputTokens}, out=${outputTokens})`,
        };
    } catch (err: unknown) {
        return errorMetric("claude", now, err);
    }
}

// Standard API key: make a lightweight request and parse rate-limit headers
async function fetchRateLimitMetrics(apiKey: string, httpGet: HttpGetFn): Promise<MetricData> {
    const now = new Date().toISOString();
    try {
        const res = await httpGet("https://api.anthropic.com/v1/models", {
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
        });

        const remaining = parseIntOrNull(res.headers["anthropic-ratelimit-tokens-remaining"]);
        const limit = parseIntOrNull(res.headers["anthropic-ratelimit-tokens-limit"]);
        const resetAt = res.headers["anthropic-ratelimit-tokens-reset"] ?? null;
        const remainingPercent = computePercent(remaining, limit);

        return {
            provider: "claude",
            status: computeStatus(remainingPercent),
            budget_type: "count",
            remaining_value: remaining,
            total_budget: limit,
            remaining_percent: remainingPercent,
            reset_at: resetAt ?? null,
            fetched_at: now,
        };
    } catch (err: unknown) {
        return errorMetric("claude", now, err);
    }
}

export async function fetchClaudeMetrics(
    apiKey: string,
    httpGet: HttpGetFn = defaultGet
): Promise<MetricData> {
    if (apiKey.startsWith("sk-ant-admin")) {
        return fetchAdminMetrics(apiKey, httpGet);
    }
    return fetchRateLimitMetrics(apiKey, httpGet);
}

function parseIntOrNull(val: string | undefined): number | null {
    if (val === undefined || val === "") return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
}

function errorMetric(provider: "claude", fetchedAt: string, err: unknown): MetricData {
    return {
        provider,
        status: "error",
        budget_type: "count",
        remaining_value: null,
        total_budget: null,
        remaining_percent: null,
        reset_at: null,
        fetched_at: fetchedAt,
        error_message: err instanceof Error ? err.message : String(err),
    };
}

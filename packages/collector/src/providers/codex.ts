import fs from "fs/promises";
import path from "path";
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
export type ReadFileFn = (filePath: string, encoding: BufferEncoding) => Promise<string>;

const defaultGet: HttpGetFn = async (url, config) => {
    const res = await axios.get(url, config);
    return {
        headers: res.headers as Record<string, string | undefined>,
        data: res.data,
    };
};

interface CodexAuth {
    token?: string;
    accessToken?: string;
}

interface WhamUsageResponse {
    remaining?: number;
    total?: number;
    reset_at?: string;
    window_remaining?: number;
    window_total?: number;
}

function getAuthJsonPath(): string {
    const codexHome = process.env["CODEX_HOME"];
    if (codexHome) return path.join(codexHome, "auth.json");
    const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    return path.join(home, ".codex", "auth.json");
}

async function readAuthToken(readFile: ReadFileFn): Promise<string> {
    const raw = await readFile(getAuthJsonPath(), "utf8");
    const auth = JSON.parse(raw) as CodexAuth;
    const token = auth.token ?? auth.accessToken;
    if (!token) throw new Error("No token found in auth.json");
    return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export async function fetchCodexMetrics(
    httpGet: HttpGetFn = defaultGet,
    readFile: ReadFileFn = fs.readFile
): Promise<MetricData> {
    const now = new Date().toISOString();
    try {
        const bearerToken = await readAuthToken(readFile);

        const res = await httpGet("https://chatgpt.com/backend-api/wham/usage", {
            headers: { Authorization: bearerToken },
        });

        const body = res.data as WhamUsageResponse;
        const remaining = body.remaining ?? body.window_remaining ?? null;
        const total = body.total ?? body.window_total ?? null;
        const resetAt = body.reset_at ?? null;
        const remainingPercent = computePercent(remaining, total);

        return {
            provider: "codex",
            status: computeStatus(remainingPercent),
            budget_type: "count",
            remaining_value: remaining,
            total_budget: total,
            remaining_percent: remainingPercent,
            reset_at: resetAt,
            fetched_at: now,
        };
    } catch (err: unknown) {
        return {
            provider: "codex",
            status: "error",
            budget_type: "count",
            remaining_value: null,
            total_budget: null,
            remaining_percent: null,
            reset_at: null,
            fetched_at: now,
            error_message: err instanceof Error ? err.message : String(err),
        };
    }
}

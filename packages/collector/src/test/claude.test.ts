import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchClaudeMetrics } from "../providers/claude.js";

const mockGet = (headers: Record<string, string | undefined>) =>
    async (_url: string, _config?: object) => ({ headers, data: {} });

test("claude: normal status when plenty of tokens remain", async () => {
    const metrics = await fetchClaudeMetrics("sk-ant-api-test", mockGet({
        "anthropic-ratelimit-tokens-remaining": "90000",
        "anthropic-ratelimit-tokens-limit": "100000",
        "anthropic-ratelimit-tokens-reset": "2026-03-07T16:00:00Z",
    }));

    assert.equal(metrics.provider, "claude");
    assert.equal(metrics.status, "normal");
    assert.equal(metrics.remaining_value, 90000);
    assert.equal(metrics.total_budget, 100000);
    assert.equal(metrics.remaining_percent, 90);
    assert.equal(metrics.reset_at, "2026-03-07T16:00:00Z");
});

test("claude: warning status when 20% tokens remain", async () => {
    const metrics = await fetchClaudeMetrics("sk-ant-api-test", mockGet({
        "anthropic-ratelimit-tokens-remaining": "20000",
        "anthropic-ratelimit-tokens-limit": "100000",
    }));

    assert.equal(metrics.status, "warning");
    assert.equal(metrics.remaining_percent, 20);
});

test("claude: critical status when 5% tokens remain", async () => {
    const metrics = await fetchClaudeMetrics("sk-ant-api-test", mockGet({
        "anthropic-ratelimit-tokens-remaining": "5000",
        "anthropic-ratelimit-tokens-limit": "100000",
    }));

    assert.equal(metrics.status, "critical");
    assert.equal(metrics.remaining_percent, 5);
});

test("claude: error status when API call fails", async () => {
    const failGet = async () => { throw new Error("Unauthorized"); };
    const metrics = await fetchClaudeMetrics("bad-key", failGet);

    assert.equal(metrics.status, "error");
    assert.equal(metrics.error_message, "Unauthorized");
    assert.equal(metrics.remaining_value, null);
});

test("claude: unknown status when headers are missing", async () => {
    const metrics = await fetchClaudeMetrics("sk-ant-api-test", mockGet({}));

    assert.equal(metrics.status, "unknown");
    assert.equal(metrics.remaining_value, null);
    assert.equal(metrics.total_budget, null);
    assert.equal(metrics.remaining_percent, null);
});

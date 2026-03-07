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

test("claude: admin key routes to usage_report endpoint", async () => {
    let capturedUrl = "";
    const adminGet = async (url: string, _config?: object) => {
        capturedUrl = url;
        return {
            headers: {},
            data: { data: { input_tokens: 100_000, output_tokens: 50_000 } },
        };
    };
    const metrics = await fetchClaudeMetrics("sk-ant-admin-key-test", adminGet);

    assert.ok(capturedUrl.includes("usage_report"), `expected usage_report in URL, got: ${capturedUrl}`);
    assert.equal(metrics.provider, "claude");
    assert.equal(metrics.status, "unknown"); // remaining quota unknown via Admin API
    assert.equal(metrics.remaining_value, 150_000); // total used tokens surfaced here
    assert.equal(metrics.remaining_percent, null);
});

test("claude: standard key routes to /v1/models endpoint", async () => {
    let capturedUrl = "";
    const stdGet = async (url: string, _config?: object) => {
        capturedUrl = url;
        return {
            headers: {
                "anthropic-ratelimit-tokens-remaining": "80000",
                "anthropic-ratelimit-tokens-limit": "100000",
            },
            data: {},
        };
    };
    const metrics = await fetchClaudeMetrics("sk-ant-api-key-test", stdGet);

    assert.ok(capturedUrl.includes("/v1/models"), `expected /v1/models in URL, got: ${capturedUrl}`);
    assert.equal(metrics.remaining_percent, 80);
});

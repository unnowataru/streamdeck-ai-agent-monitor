import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCodexMetrics } from "../providers/codex.js";

const mockAuthFile = (token: string) =>
    async (_path: string, _enc: BufferEncoding) =>
        JSON.stringify({ token });

const mockGet = (body: unknown) =>
    async (_url: string, _config?: object) => ({ headers: {}, data: body });

test("codex: normal status with healthy quota", async () => {
    const metrics = await fetchCodexMetrics(
        mockGet({ remaining: 270, total: 300, reset_at: "2026-03-07T20:00:00Z" }),
        mockAuthFile("Bearer oauth-token-xxx")
    );

    assert.equal(metrics.provider, "codex");
    assert.equal(metrics.status, "normal");
    assert.equal(metrics.budget_type, "count");
    assert.equal(metrics.remaining_value, 270);
    assert.equal(metrics.total_budget, 300);
    assert.equal(metrics.remaining_percent, 90);
    assert.equal(metrics.reset_at, "2026-03-07T20:00:00Z");
});

test("codex: warning status when quota is low", async () => {
    const metrics = await fetchCodexMetrics(
        mockGet({ remaining: 60, total: 300 }),
        mockAuthFile("oauth-token-xxx")  // token without Bearer prefix
    );

    assert.equal(metrics.status, "warning");
    assert.equal(metrics.remaining_percent, 20);
});

test("codex: critical status when quota is very low", async () => {
    const metrics = await fetchCodexMetrics(
        mockGet({ remaining: 15, total: 300 }),
        mockAuthFile("Bearer oauth-token-xxx")
    );

    assert.equal(metrics.status, "critical");
    assert.equal(metrics.remaining_percent, 5);
});

test("codex: error status when auth.json is missing", async () => {
    const failRead = async () => { throw new Error("ENOENT"); };
    const metrics = await fetchCodexMetrics(mockGet({}), failRead);

    assert.equal(metrics.status, "error");
    assert.match(metrics.error_message ?? "", /ENOENT/);
});

test("codex: error status when wham/usage request fails", async () => {
    const failGet = async () => { throw new Error("Network error"); };
    const metrics = await fetchCodexMetrics(failGet, mockAuthFile("Bearer token"));

    assert.equal(metrics.status, "error");
    assert.equal(metrics.error_message, "Network error");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchXaiMetrics } from "../providers/xai.js";

const mockGet = (body: unknown) =>
    async (_url: string, _config?: object) => ({ headers: {}, data: body });

test("xai: normal status with healthy balance", async () => {
    // total.val = "2000" cents = $20.00, hard_limit = "2500" = $25.00
    const metrics = await fetchXaiMetrics("xai-key", "team-123", mockGet({
        total: { val: "2000" },
        hard_limit: { val: "2500" },
    }));

    assert.equal(metrics.provider, "xai");
    assert.equal(metrics.status, "normal");
    assert.equal(metrics.budget_type, "currency");
    assert.equal(metrics.remaining_value, 20);
    assert.equal(metrics.total_budget, 25);
    assert.equal(metrics.remaining_percent, 80);
});

test("xai: warning status when balance is low", async () => {
    // 20% remaining
    const metrics = await fetchXaiMetrics("xai-key", "team-123", mockGet({
        total: { val: "500" },
        hard_limit: { val: "2500" },
    }));

    assert.equal(metrics.status, "warning");
    assert.equal(metrics.remaining_percent, 20);
});

test("xai: critical status when balance is very low", async () => {
    // 4% remaining
    const metrics = await fetchXaiMetrics("xai-key", "team-123", mockGet({
        total: { val: "100" },
        hard_limit: { val: "2500" },
    }));

    assert.equal(metrics.status, "critical");
    assert.equal(metrics.remaining_percent, 4);
});

test("xai: error status on API failure", async () => {
    const failGet = async () => { throw new Error("Forbidden"); };
    const metrics = await fetchXaiMetrics("bad-key", "team-123", failGet);

    assert.equal(metrics.status, "error");
    assert.equal(metrics.error_message, "Forbidden");
});

test("xai: total_budget is null when hard_limit is absent", async () => {
    const metrics = await fetchXaiMetrics("xai-key", "team-123", mockGet({
        total: { val: "1000" },
    }));

    assert.equal(metrics.total_budget, null);
    assert.equal(metrics.remaining_percent, null);
    assert.equal(metrics.status, "unknown");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    MetricDataSchema,
    ApiCredentialsSchema,
    IpcMessageSchema,
} from "../schemas.js";

// ---- MetricDataSchema -------------------------------------------------------

const validMetric = {
    provider: "claude",
    status: "normal",
    budget_type: "count",
    remaining_value: 90000,
    total_budget: 100000,
    remaining_percent: 90,
    reset_at: "2026-03-07T16:00:00Z",
    fetched_at: "2026-03-07T15:00:00Z",
};

test("MetricDataSchema: accepts valid metric with all fields", () => {
    assert.ok(MetricDataSchema.safeParse(validMetric).success);
});

test("MetricDataSchema: accepts metric with nullable fields as null", () => {
    const data = {
        ...validMetric,
        remaining_value: null,
        total_budget: null,
        remaining_percent: null,
        reset_at: null,
    };
    assert.ok(MetricDataSchema.safeParse(data).success);
});

test("MetricDataSchema: accepts optional error_message", () => {
    const data = { ...validMetric, status: "error", error_message: "timeout" };
    assert.ok(MetricDataSchema.safeParse(data).success);
});

test("MetricDataSchema: rejects unknown provider", () => {
    const data = { ...validMetric, provider: "openai" };
    assert.ok(!MetricDataSchema.safeParse(data).success);
});

test("MetricDataSchema: rejects unknown status", () => {
    const data = { ...validMetric, status: "degraded" };
    assert.ok(!MetricDataSchema.safeParse(data).success);
});

test("MetricDataSchema: rejects missing fetched_at", () => {
    const { fetched_at: _, ...data } = validMetric;
    assert.ok(!MetricDataSchema.safeParse(data).success);
});

test("MetricDataSchema: accepts all three providers", () => {
    for (const provider of ["claude", "xai", "codex"] as const) {
        assert.ok(MetricDataSchema.safeParse({ ...validMetric, provider }).success);
    }
});

// ---- ApiCredentialsSchema ---------------------------------------------------

test("ApiCredentialsSchema: accepts claude with api_key", () => {
    assert.ok(ApiCredentialsSchema.safeParse({ provider: "claude", api_key: "sk-ant-xxx" }).success);
});

test("ApiCredentialsSchema: accepts xai with api_key", () => {
    assert.ok(ApiCredentialsSchema.safeParse({ provider: "xai", api_key: "xai-xxx" }).success);
});

test("ApiCredentialsSchema: accepts codex without api_key", () => {
    assert.ok(ApiCredentialsSchema.safeParse({ provider: "codex" }).success);
});

test("ApiCredentialsSchema: rejects claude with empty api_key", () => {
    assert.ok(!ApiCredentialsSchema.safeParse({ provider: "claude", api_key: "" }).success);
});

test("ApiCredentialsSchema: rejects unknown provider", () => {
    assert.ok(!ApiCredentialsSchema.safeParse({ provider: "openai", api_key: "sk-xxx" }).success);
});

// ---- IpcMessageSchema -------------------------------------------------------

test("IpcMessageSchema: accepts METRICS_UPDATE with valid payload", () => {
    const msg = { type: "METRICS_UPDATE", payload: validMetric };
    assert.ok(IpcMessageSchema.safeParse(msg).success);
});

test("IpcMessageSchema: accepts SET_CREDENTIALS for claude", () => {
    const msg = { type: "SET_CREDENTIALS", payload: { provider: "claude", api_key: "sk-ant-xxx" } };
    assert.ok(IpcMessageSchema.safeParse(msg).success);
});

test("IpcMessageSchema: accepts SET_CREDENTIALS for codex (no key)", () => {
    const msg = { type: "SET_CREDENTIALS", payload: { provider: "codex" } };
    assert.ok(IpcMessageSchema.safeParse(msg).success);
});

test("IpcMessageSchema: accepts COLLECTOR_READY (no payload)", () => {
    assert.ok(IpcMessageSchema.safeParse({ type: "COLLECTOR_READY" }).success);
});

test("IpcMessageSchema: accepts COLLECTOR_ERROR with message", () => {
    const msg = { type: "COLLECTOR_ERROR", payload: { message: "network error" } };
    assert.ok(IpcMessageSchema.safeParse(msg).success);
});

test("IpcMessageSchema: rejects unknown message type", () => {
    assert.ok(!IpcMessageSchema.safeParse({ type: "UNKNOWN_TYPE" }).success);
});

test("IpcMessageSchema: rejects METRICS_UPDATE with missing provider", () => {
    const msg = { type: "METRICS_UPDATE", payload: { ...validMetric, provider: undefined } };
    assert.ok(!IpcMessageSchema.safeParse(msg).success);
});

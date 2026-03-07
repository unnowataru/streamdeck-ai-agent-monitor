import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatus, computePercent } from "../utils.js";

// ---- computeStatus ----------------------------------------------------------

test("computeStatus: null → unknown", () => {
    assert.equal(computeStatus(null), "unknown");
});

test("computeStatus: 0% → critical", () => {
    assert.equal(computeStatus(0), "critical");
});

test("computeStatus: 10% → critical (lower boundary)", () => {
    assert.equal(computeStatus(10), "critical");
});

test("computeStatus: 11% → warning (boundary above critical)", () => {
    assert.equal(computeStatus(11), "warning");
});

test("computeStatus: 25% → warning (upper boundary)", () => {
    assert.equal(computeStatus(25), "warning");
});

test("computeStatus: 26% → normal (boundary above warning)", () => {
    assert.equal(computeStatus(26), "normal");
});

test("computeStatus: 100% → normal", () => {
    assert.equal(computeStatus(100), "normal");
});

// ---- computePercent ---------------------------------------------------------

test("computePercent: 50 of 100 → 50", () => {
    assert.equal(computePercent(50, 100), 50);
});

test("computePercent: null remaining → null", () => {
    assert.equal(computePercent(null, 100), null);
});

test("computePercent: null total → null", () => {
    assert.equal(computePercent(50, null), null);
});

test("computePercent: total 0 → null (division by zero)", () => {
    assert.equal(computePercent(50, 0), null);
});

test("computePercent: caps at 100 when remaining exceeds total", () => {
    assert.equal(computePercent(150, 100), 100);
});

test("computePercent: clamps to 0 when remaining is negative (overdrawn)", () => {
    assert.equal(computePercent(-500, 10000), 0);
});

test("computePercent: rounds to nearest integer", () => {
    // 1/3 * 100 = 33.33... → 33
    assert.equal(computePercent(1, 3), 33);
});

test("computePercent: 0 remaining → 0", () => {
    assert.equal(computePercent(0, 100), 0);
});

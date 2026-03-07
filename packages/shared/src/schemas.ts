import { z } from "zod";

export const QuotaStatusSchema = z.enum(["normal", "warning", "critical", "unknown", "error"]);

export const MetricDataSchema = z.object({
    provider: z.enum(["claude", "xai", "codex"]),
    status: QuotaStatusSchema,
    budget_type: z.enum(["currency", "count", "percent"]),
    remaining_value: z.number().nullable(),
    total_budget: z.number().nullable(),
    remaining_percent: z.number().nullable(), // 0-100
    reset_at: z.string().nullable(), // ISO String or null
    fetched_at: z.string(), // ISO String
    error_message: z.string().optional()
});

export const IpcMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("METRICS_UPDATE"),
        payload: MetricDataSchema
    }),
    z.object({
        type: z.literal("COLLECTOR_READY")
    }),
    z.object({
        type: z.literal("COLLECTOR_ERROR"),
        payload: z.object({
            message: z.string()
        })
    })
]);

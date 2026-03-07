import { z } from "zod";
import { QuotaStatusSchema, MetricDataSchema, IpcMessageSchema } from "./schemas.js";

export type QuotaStatus = z.infer<typeof QuotaStatusSchema>;
export type MetricData = z.infer<typeof MetricDataSchema>;
export type IpcMessage = z.infer<typeof IpcMessageSchema>;

import { z } from "zod";
import { QuotaStatusSchema, MetricDataSchema, ApiCredentialsSchema, IpcMessageSchema } from "./schemas.js";

export type QuotaStatus = z.infer<typeof QuotaStatusSchema>;
export type MetricData = z.infer<typeof MetricDataSchema>;
export type ApiCredentials = z.infer<typeof ApiCredentialsSchema>;
export type IpcMessage = z.infer<typeof IpcMessageSchema>;

import { IpcMessageSchema } from "@ai-monitor/shared";
import { sendMessage } from "./ipc.js";
import { Poller } from "./poller.js";

const intervalMs = parseInt(process.env["POLL_INTERVAL_MS"] ?? "60000", 10);

const poller = new Poller((metrics) => {
    sendMessage({ type: "METRICS_UPDATE", payload: metrics });
}, intervalMs);

process.on("message", (raw: unknown) => {
    const result = IpcMessageSchema.safeParse(raw);
    if (!result.success) return;

    const msg = result.data;
    switch (msg.type) {
        case "SET_CREDENTIALS":  poller.setCredentials(msg.payload); break;
        case "FORCE_POLL":       poller.pollAll();                   break;
        case "PAUSE_POLLING":    poller.pause();                     break;
        case "RESUME_POLLING":   poller.resume();                    break;
    }
});

process.on("disconnect", () => {
    poller.stopAll();
    process.exit(0);
});

sendMessage({ type: "COLLECTOR_READY" });

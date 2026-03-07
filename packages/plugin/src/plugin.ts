import streamDeck from "@elgato/streamdeck";
import { fork, type ChildProcess } from "child_process";
import path from "path";
import { IpcMessageSchema } from "@ai-monitor/shared";
import { MonitorAction } from "./actions/monitor";

// Collector lives at packages/collector/dist/index.js relative to this bundle.
// At runtime __dirname = packages/plugin/dist/, so ../../collector/dist/index.js
const COLLECTOR_PATH = path.join(__dirname, "../../collector/dist/index.js");

const monitorAction = new MonitorAction();

// --- Fork the local collector -----------------------------------------------
const collector: ChildProcess = fork(COLLECTOR_PATH, [], {
    env: {
        ...process.env,
        POLL_INTERVAL_MS: String(60_000),
    },
    detached: false,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
});

collector.stderr?.on("data", (buf: Buffer) => {
    streamDeck.logger.error(`[collector] ${buf.toString().trim()}`);
});

collector.on("error", (err) => {
    streamDeck.logger.error(`[collector] process error: ${err.message}`);
});

collector.on("exit", (code) => {
    streamDeck.logger.warn(`[collector] exited with code ${code}`);
});

// --- IPC: collector → plugin -------------------------------------------------
collector.on("message", (raw: unknown) => {
    const result = IpcMessageSchema.safeParse(raw);
    if (!result.success) {
        streamDeck.logger.warn("[collector] received invalid IPC message");
        return;
    }

    const msg = result.data;
    switch (msg.type) {
        case "COLLECTOR_READY":
            streamDeck.logger.info("[collector] ready — sending credentials");
            void sendCredentials();
            break;

        case "METRICS_UPDATE":
            monitorAction.updateMetrics(msg.payload);
            break;

        case "COLLECTOR_ERROR":
            streamDeck.logger.error(`[collector] ${msg.payload.message}`);
            break;
    }
});

// Refresh credentials whenever user saves new global settings
streamDeck.settings.onDidReceiveGlobalSettings(() => {
    void sendCredentials();
});

async function sendCredentials(): Promise<void> {
    // Cast to avoid JsonObject index-signature constraint;
    // all values stored via the property inspector are strings.
    const s = (await streamDeck.settings.getGlobalSettings()) as Record<string, string | undefined>;

    if (s["claudeApiKey"]) {
        collector.send({
            type: "SET_CREDENTIALS",
            payload: { provider: "claude", api_key: s["claudeApiKey"] },
        });
    }

    if (s["xaiApiKey"]) {
        if (s["xaiTeamId"]) {
            process.env["XAI_TEAM_ID"] = s["xaiTeamId"];
        }
        collector.send({
            type: "SET_CREDENTIALS",
            payload: { provider: "xai", api_key: s["xaiApiKey"] },
        });
    }

    // Codex needs no API key — always enable
    collector.send({ type: "SET_CREDENTIALS", payload: { provider: "codex" } });
}

// --- Register action & connect -----------------------------------------------
streamDeck.actions.registerAction(monitorAction);
// connect() returns a Promise; top-level await is unavailable in CJS bundles.
streamDeck.connect().catch((err: unknown) => {
    streamDeck.logger.error(`Failed to connect to Stream Deck: ${String(err)}`);
});

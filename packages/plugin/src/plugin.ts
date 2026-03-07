import streamDeck from "@elgato/streamdeck";
import { fork, type ChildProcess } from "child_process";
import path from "path";
import { IpcMessageSchema } from "@ai-monitor/shared";
import { MonitorAction } from "./actions/monitor";

// Collector is bundled to a single file and placed alongside the plugin package.
// At runtime __dirname = <plugin>.sdPlugin/dist/, so ../collector.js
const COLLECTOR_PATH = path.join(__dirname, "../collector.js");

const MAX_RETRIES   = 5;
const BASE_DELAY_MS = 2_000;

const monitorAction = new MonitorAction();

let collector: ChildProcess;
let retryCount = 0;

// --- Fork the local collector -----------------------------------------------
function startCollector(): void {
    collector = fork(COLLECTOR_PATH, [], {
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
        if (retryCount >= MAX_RETRIES) {
            streamDeck.logger.error(`[collector] max retries (${MAX_RETRIES}) reached — giving up`);
            return;
        }
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), 60_000);
        retryCount++;
        streamDeck.logger.info(
            `[collector] restarting in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`,
        );
        setTimeout(startCollector, delay);
    });

    // --- IPC: collector → plugin ---------------------------------------------
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
                retryCount = 0; // successful start — reset backoff counter
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
}

startCollector();

// Refresh credentials whenever user saves new global settings
streamDeck.settings.onDidReceiveGlobalSettings(() => {
    void sendCredentials();
});

async function sendCredentials(): Promise<void> {
    // Cast to avoid JsonObject index-signature constraint;
    // all values stored via the property inspector are strings.
    const s = (await streamDeck.settings.getGlobalSettings()) as Record<string, string | undefined>;

    const activeProviders: Array<"claude" | "xai" | "codex"> = [];

    if (s["claudeApiKey"]) {
        collector.send({
            type: "SET_CREDENTIALS",
            payload: { provider: "claude", api_key: s["claudeApiKey"] },
        });
        activeProviders.push("claude");
    }

    if (s["xaiApiKey"]) {
        collector.send({
            type: "SET_CREDENTIALS",
            payload: { provider: "xai", api_key: s["xaiApiKey"], team_id: s["xaiTeamId"] },
        });
        activeProviders.push("xai");
    }

    // Codex needs no API key — always enable
    collector.send({ type: "SET_CREDENTIALS", payload: { provider: "codex" } });
    activeProviders.push("codex");

    monitorAction.setActiveProviders(activeProviders);
}

// --- Register action & connect -----------------------------------------------
streamDeck.actions.registerAction(monitorAction);
// connect() returns a Promise; top-level await is unavailable in CJS bundles.
streamDeck.connect().catch((err: unknown) => {
    streamDeck.logger.error(`Failed to connect to Stream Deck: ${String(err)}`);
});

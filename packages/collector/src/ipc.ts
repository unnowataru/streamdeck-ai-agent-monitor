import { IpcMessage, IpcMessageSchema } from "@ai-monitor/shared";

export function sendMessage(msg: IpcMessage): void {
    if (process.send) {
        process.send(msg);
    }
}

export function onMessage(handler: (msg: IpcMessage) => void): void {
    process.on("message", (raw: unknown) => {
        const result = IpcMessageSchema.safeParse(raw);
        if (result.success) {
            handler(result.data);
        }
    });
}

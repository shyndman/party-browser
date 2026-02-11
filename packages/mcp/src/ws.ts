import { WebSocketServer } from "ws";

import { mcpConfig } from "@/config/mcp.config";

export async function createWebSocketServer(
  port: number = mcpConfig.defaultWsPort,
): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    let wss: WebSocketServer;
    try {
      wss = new WebSocketServer({ port });
    } catch (error) {
      reject(error);
      return;
    }

    const cleanup = () => {
      wss.off("listening", onListening);
      wss.off("error", onError);
    };

    const onListening = () => {
      cleanup();
      resolve(wss);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    wss.once("listening", onListening);
    wss.once("error", onError);
  });
}

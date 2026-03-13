import { strict as assert } from "node:assert";
import net from "node:net";
import test from "node:test";
import { WebSocketServer } from "ws";

import { MCP_ERROR_CODES } from "./constants";
import { CodedError, WebSocketHubConnection } from "./ws-sender";

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an ephemeral port."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

test("hub probe fails with a coded hub-unavailable error when the hub is unreachable", async () => {
  const port = await getAvailablePort();
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  await assert.rejects(
    () => connection.probe(),
    (error: unknown) => {
      assert.ok(error instanceof CodedError);
      assert.equal(error.errorCode, MCP_ERROR_CODES.HUB_CONNECTION_UNAVAILABLE);
      return true;
    },
  );
});

test("hub probe succeeds when the hub accepts a websocket connection", async () => {
  const port = await getAvailablePort();
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const connection = new WebSocketHubConnection(`ws://127.0.0.1:${port}`);

  await assert.doesNotReject(() => connection.probe());

  await connection.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

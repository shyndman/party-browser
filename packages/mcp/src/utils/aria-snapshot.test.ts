import { strict as assert } from "node:assert";
import test from "node:test";

import { Context } from "@/context";

import { captureAriaSnapshot, extractPageState, formatAriaSnapshot } from "./aria-snapshot";

test("formatAriaSnapshot preserves response text shape from lifecycle-managed page state", () => {
  const output = formatAriaSnapshot(
    extractPageState({
      success: true,
      data: {
        pageState: {
          url: "https://example.com/after",
          title: "After",
          tree: [{ ref: "e1", tagName: "button", name: "Submit" }],
        },
      },
    }),
    'Clicked "css:#submit"',
  ).content[0];

  assert.ok(output);
  assert.equal(output.type, "text");
  assert.match(output.text, /^Clicked "css:#submit"/);
  assert.match(output.text, /- Page URL: https:\/\/example\.com\/after/);
  assert.match(output.text, /- Page Title: After/);
  assert.match(output.text, /e1 button: Submit/);
});

test("captureAriaSnapshot reads URL/title/tree from atomic snapshot response", async () => {
  const context = {
    sendSocketMessage: async (type: string, _payload: unknown, options: unknown) => {
      assert.equal(type, "snapshot");
      assert.deepEqual(options, { requestId: "call-123" });
      return {
        success: true,
        data: {
          url: "https://news.ycombinator.com",
          title: "Hacker News",
          tree: [{ ref: "e1", tagName: "a", name: "First Link" }],
        },
      };
    },
  } as unknown as Context;

  const result = await captureAriaSnapshot(context, "", "call-123");
  const output = result.content[0]?.type === "text" ? result.content[0].text : "";
  assert.match(output, /- Page URL: https:\/\/news\.ycombinator\.com/);
  assert.match(output, /- Page Title: Hacker News/);
  assert.match(output, /e1 a: First Link/);
});

test("captureAriaSnapshot reports failed snapshot commands instead of formatting an empty tree", async () => {
  const context = {
    sendSocketMessage: async () => ({ success: false, error: "Content script unavailable." }),
  } as unknown as Context;

  await assert.rejects(
    () => captureAriaSnapshot(context),
    (error: unknown) => error instanceof Error && error.message === "Content script unavailable.",
  );
});

test("captureAriaSnapshot reports missing metadata clearly", async () => {
  const context = {
    sendSocketMessage: async () => ({ success: true, data: { tree: [] } }),
  } as unknown as Context;

  await assert.rejects(
    () => captureAriaSnapshot(context),
    (error: unknown) => error instanceof Error
      && error.message === "Page URL readback failed: snapshot response did not contain a URL.",
  );
});


test("captureAriaSnapshot preserves legacy atomic snapshot payload shape", async () => {
  const context = {
    sendSocketMessage: async () => ({
      url: "https://example.com",
      title: "Example",
      tree: { foo: "bar" },
    }),
  } as unknown as Context;

  const result = await captureAriaSnapshot(context);
  const output = result.content[0]?.type === "text" ? result.content[0].text : "";

  assert.match(output, /- Page URL: https:\/\/example\.com/);
  assert.match(output, /- Page Title: Example/);
  assert.match(output, /"foo": "bar"/);
});

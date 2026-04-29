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

test("captureAriaSnapshot reads URL/title/tree from data envelope shape", async () => {
  const responses = {
    getUrl: { success: true, data: { url: "https://news.ycombinator.com" } },
    getTitle: { success: true, data: { title: "Hacker News" } },
    snapshot: {
      success: true,
      data: {
        url: "https://news.ycombinator.com",
        title: "Hacker News",
        tree: [{ ref: "e1", tagName: "a", name: "First Link" }],
      },
    },
  } as const;
  const capturedOptions: unknown[] = [];

  const context = {
    sendSocketMessage: async (type: keyof typeof responses, _payload: unknown, options: unknown) => {
      capturedOptions.push(options);
      return responses[type];
    },
  } as unknown as Context;

  const result = await captureAriaSnapshot(context, "", "call-123");
  const output = result.content[0]?.type === "text" ? result.content[0].text : "";

  assert.deepEqual(capturedOptions, [
    { requestId: "call-123" },
    { requestId: "call-123" },
    { requestId: "call-123" },
  ]);
  assert.match(output, /- Page URL: https:\/\/news\.ycombinator\.com/);
  assert.match(output, /- Page Title: Hacker News/);
  assert.match(output, /e1 a: First Link/);
});

test("captureAriaSnapshot preserves legacy payload shape", async () => {
  const responses = {
    getUrl: { url: "https://example.com" },
    getTitle: { title: "Example" },
    snapshot: { tree: { foo: "bar" } },
  } as const;

  const context = {
    sendSocketMessage: async (type: keyof typeof responses) => responses[type],
  } as unknown as Context;

  const result = await captureAriaSnapshot(context);
  const output = result.content[0]?.type === "text" ? result.content[0].text : "";

  assert.match(output, /- Page URL: https:\/\/example\.com/);
  assert.match(output, /- Page Title: Example/);
  assert.match(output, /"foo": "bar"/);
});

import { strict as assert } from "node:assert";
import test from "node:test";

import { Context } from "@/context";

import { captureAriaSnapshot } from "./aria-snapshot";

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

  const context = {
    sendSocketMessage: async (type: keyof typeof responses) => responses[type],
  } as unknown as Context;

  const result = await captureAriaSnapshot(context);
  const output = result.content[0]?.type === "text" ? result.content[0].text : "";

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

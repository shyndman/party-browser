import { strict as assert } from "node:assert";
import test from "node:test";

import { JoinSessionTool } from "./tool-definitions";

test("join_session accepts workspace with URL", () => {
  const parsed = JoinSessionTool.shape.arguments.parse({
    name: "Agent Workspace",
    reason: "Search AliExpress",
    leaseKind: "workspace",
    url: "https://aliexpress.com",
  });

  assert.equal(parsed.leaseKind, "workspace");
  assert.equal(parsed.url, "https://aliexpress.com");
});

test("join_session rejects workspace without URL", () => {
  assert.throws(() =>
    JoinSessionTool.shape.arguments.parse({
      name: "Agent Workspace",
      reason: "Search AliExpress",
      leaseKind: "workspace",
    }),
  );
});

test("join_session accepts takeover without URL", () => {
  const parsed = JoinSessionTool.shape.arguments.parse({
    name: "Agent Takeover",
    reason: "Help in current tab",
    leaseKind: "takeover",
  });

  assert.equal(parsed.leaseKind, "takeover");
  assert.equal(parsed.url, undefined);
});

test("join_session accepts takeover compatibility url placeholders", () => {
  const parsedWithNull = JoinSessionTool.shape.arguments.parse({
    name: "Agent Takeover",
    reason: "Help in current tab",
    leaseKind: "takeover",
    url: null,
  });

  const parsedWithEmptyString = JoinSessionTool.shape.arguments.parse({
    name: "Agent Takeover",
    reason: "Help in current tab",
    leaseKind: "takeover",
    url: "",
  });

  assert.equal(parsedWithNull.url, undefined);
  assert.equal(parsedWithEmptyString.url, undefined);
});

test("join_session rejects takeover with URL", () => {
  assert.throws(() =>
    JoinSessionTool.shape.arguments.parse({
      name: "Agent Takeover",
      reason: "Help in current tab",
      leaseKind: "takeover",
      url: "https://example.com",
    }),
  );
});

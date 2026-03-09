import { strict as assert } from "node:assert";
import test from "node:test";
import type { Logger } from "winston";

import { WaitingRoomJoinSoundNotifier } from "@/audio/waiting-room-sound";

function createTestLogger() {
  const infoLogs: Array<Record<string, unknown> | undefined> = [];
  const debugLogs: Array<Record<string, unknown> | undefined> = [];
  const warnLogs: Array<Record<string, unknown> | undefined> = [];

  const logger = {
    info: (_message: string, metadata?: Record<string, unknown>) => {
      infoLogs.push(metadata);
    },
    debug: (_message: string, metadata?: Record<string, unknown>) => {
      debugLogs.push(metadata);
    },
    warn: (_message: string, metadata?: Record<string, unknown>) => {
      warnLogs.push(metadata);
    },
  } as unknown as Logger;

  return { logger, infoLogs, debugLogs, warnLogs };
}

test("does not attempt playback on non-linux platforms", async () => {
  const { logger } = createTestLogger();
  let playCount = 0;

  const notifier = new WaitingRoomJoinSoundNotifier({
    logger,
    platform: "darwin",
    readFileFn: async () => Buffer.from("wave"),
    playWaveDataFn: async () => {
      playCount += 1;
    },
  });

  await notifier.notifyJoinRequest("session-1");

  assert.equal(playCount, 0);
});

test("plays sound for unique join events and dedupes same session inside window", async () => {
  const { logger } = createTestLogger();
  let now = 10_000;
  let playCount = 0;

  const notifier = new WaitingRoomJoinSoundNotifier({
    logger,
    platform: "linux",
    now: () => now,
    dedupeWindowMs: 3_000,
    readFileFn: async () => Buffer.from("wave"),
    playWaveDataFn: async () => {
      playCount += 1;
    },
  });

  await notifier.notifyJoinRequest("session-1");
  await notifier.notifyJoinRequest("session-1");

  now += 3_100;
  await notifier.notifyJoinRequest("session-1");

  assert.equal(playCount, 2);
});

test("skips playback when another sound is currently playing", async () => {
  const { logger } = createTestLogger();
  let releasePlayback: () => void = () => {};
  const playbackGate = new Promise<void>((resolve) => {
    releasePlayback = resolve;
  });
  let playCount = 0;

  const notifier = new WaitingRoomJoinSoundNotifier({
    logger,
    platform: "linux",
    readFileFn: async () => Buffer.from("wave"),
    playWaveDataFn: async () => {
      playCount += 1;
      await playbackGate;
    },
  });

  const firstPlayback = notifier.notifyJoinRequest("session-1");
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  await notifier.notifyJoinRequest("session-2");

  assert.equal(playCount, 1);
  releasePlayback();
  await firstPlayback;

  await notifier.notifyJoinRequest("session-3");
  assert.equal(playCount, 2);
});

test("logs warning and does not replay when sound file cannot be loaded", async () => {
  const { logger, warnLogs } = createTestLogger();
  let readCount = 0;
  let playCount = 0;

  const notifier = new WaitingRoomJoinSoundNotifier({
    logger,
    platform: "linux",
    readFileFn: async () => {
      readCount += 1;
      throw new Error("missing");
    },
    playWaveDataFn: async () => {
      playCount += 1;
    },
  });

  await notifier.notifyJoinRequest("session-1");
  await notifier.notifyJoinRequest("session-2");

  assert.equal(readCount, 1);
  assert.equal(playCount, 0);
  assert.equal(warnLogs.length, 1);
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { playWaveData } from "@echogarden/audio-io";
import type { Logger } from "winston";

export const HUB_WAITING_ROOM_SOUND_PATH_ENV_VAR = "PARTYBROWSER_HUB_WAITING_ROOM_SOUND_PATH";
export const WAITING_ROOM_SOUND_DEDUPE_WINDOW_MS = 3_000;

const BUNDLED_WAITING_ROOM_SOUND_PATH = resolve(process.cwd(), "assets", "waiting-room-join.wav");

type PlayWaveDataFn = (waveData: Uint8Array) => Promise<void>;
type ReadFileFn = (path: string) => Promise<Buffer>;

type WaitingRoomJoinSoundNotifierOptions = {
  logger: Logger;
  platform?: NodeJS.Platform;
  soundPath?: string;
  dedupeWindowMs?: number;
  now?: () => number;
  playWaveDataFn?: PlayWaveDataFn;
  readFileFn?: ReadFileFn;
};

function resolveSoundPath(configuredPath?: string): string {
  if (configuredPath && configuredPath.trim().length > 0) {
    return configuredPath.trim();
  }

  const envPath = process.env[HUB_WAITING_ROOM_SOUND_PATH_ENV_VAR]?.trim();
  if (envPath && envPath.length > 0) {
    return envPath;
  }

  return BUNDLED_WAITING_ROOM_SOUND_PATH;
}

export class WaitingRoomJoinSoundNotifier {
  private readonly logger: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly soundPath: string;
  private readonly dedupeWindowMs: number;
  private readonly now: () => number;
  private readonly playWaveDataFn: PlayWaveDataFn;
  private readonly readFileFn: ReadFileFn;
  private readonly recentJoinTimes = new Map<string, number>();

  private isPlaying = false;
  private waveDataPromise: Promise<Uint8Array | null> | undefined;

  constructor(options: WaitingRoomJoinSoundNotifierOptions) {
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
    this.soundPath = resolveSoundPath(options.soundPath);
    this.dedupeWindowMs = options.dedupeWindowMs ?? WAITING_ROOM_SOUND_DEDUPE_WINDOW_MS;
    this.now = options.now ?? Date.now;
    this.playWaveDataFn = options.playWaveDataFn ?? playWaveData;
    this.readFileFn = options.readFileFn ?? readFile;

    this.logger.info("Configured waiting-room join sound notifier.", {
      event: "hub.waiting_room_sound.configure",
      soundPath: this.soundPath,
      platform: this.platform,
      dedupeWindowMs: this.dedupeWindowMs,
      enabled: this.platform === "linux",
    });
  }

  async notifyJoinRequest(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    if (this.platform !== "linux") {
      this.logger.debug("Skipping waiting-room join sound on unsupported platform.", {
        event: "hub.waiting_room_sound.skip",
        reason: "unsupported_platform",
        platform: this.platform,
      });
      return;
    }

    const now = this.now();
    this.pruneRecentJoinTimes(now);

    const previousJoinTime = this.recentJoinTimes.get(sessionId);
    if (previousJoinTime !== undefined && now - previousJoinTime < this.dedupeWindowMs) {
      this.logger.debug("Skipping duplicate waiting-room join sound event.", {
        event: "hub.waiting_room_sound.skip",
        reason: "dedupe",
        sessionId,
      });
      return;
    }

    this.recentJoinTimes.set(sessionId, now);

    if (this.isPlaying) {
      this.logger.debug("Skipping waiting-room join sound while playback is already active.", {
        event: "hub.waiting_room_sound.skip",
        reason: "playback_busy",
        sessionId,
      });
      return;
    }

    this.isPlaying = true;
    try {
      const waveData = await this.loadWaveData();
      if (!waveData) {
        return;
      }

      await this.playWaveDataFn(waveData);
      this.logger.info("Played waiting-room join sound.", {
        event: "hub.waiting_room_sound.play",
        sessionId,
      });
    } catch (error) {
      const details = this.getErrorDetails(error);
      this.logger.warn("Failed to play waiting-room join sound.", {
        event: "hub.waiting_room_sound.play",
        sessionId,
        errorName: details.errorName,
        errorMessage: details.errorMessage,
      });
    } finally {
      this.isPlaying = false;
    }
  }

  private async loadWaveData(): Promise<Uint8Array | null> {
    if (!this.waveDataPromise) {
      this.waveDataPromise = this.readWaveDataFromDisk();
    }

    return this.waveDataPromise;
  }

  private async readWaveDataFromDisk(): Promise<Uint8Array | null> {
    try {
      const fileData = await this.readFileFn(this.soundPath);
      return new Uint8Array(fileData);
    } catch (error) {
      const details = this.getErrorDetails(error);
      this.logger.warn("Waiting-room join sound file is unavailable; sound playback disabled.", {
        event: "hub.waiting_room_sound.configure",
        soundPath: this.soundPath,
        errorName: details.errorName,
        errorMessage: details.errorMessage,
      });
      return null;
    }
  }

  private pruneRecentJoinTimes(now: number): void {
    for (const [sessionId, timestamp] of this.recentJoinTimes) {
      if (now - timestamp >= this.dedupeWindowMs) {
        this.recentJoinTimes.delete(sessionId);
      }
    }
  }

  private getErrorDetails(error: unknown): { errorName: string; errorMessage: string } {
    if (error instanceof Error) {
      return {
        errorName: error.name,
        errorMessage: error.message,
      };
    }

    return {
      errorName: typeof error,
      errorMessage: String(error),
    };
  }
}

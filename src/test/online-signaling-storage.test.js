import { describe, expect, it } from "vitest";
import { appendSignal, drainSignals, signalKey } from "../../functions/api/rooms/_shared.js";

class MemoryKv {
  constructor({ withList = false } = {}) {
    this.withList = withList;
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }

  async list({ prefix = "" } = {}) {
    if (!this.withList) {
      throw new Error("list is not available");
    }
    return {
      blobs: Array.from(this.values.keys())
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((key) => ({ key, etag: "test" })),
      directories: [],
    };
  }
}

describe("online room signaling storage", () => {
  it("stores list-capable signal queues as independent entries", async () => {
    const kv = new MemoryKv({ withList: true });
    const roomCode = "123456";
    const targetPeerId = "guest";
    const candidates = ["candidate-a", "candidate-b", "candidate-c"];

    await Promise.all(
      candidates.map((candidate) =>
        appendSignal(kv, roomCode, targetPeerId, {
          type: "ice",
          peerId: "host",
          targetPeerId,
          payload: { candidate },
        }),
      ),
    );

    expect(kv.values.has(signalKey(roomCode, targetPeerId))).toBe(false);

    const drained = await drainSignals(kv, roomCode, targetPeerId);
    expect(drained).toHaveLength(3);
    expect(drained.map((signal) => signal.payload.candidate).sort()).toEqual(candidates);
    expect(await drainSignals(kv, roomCode, targetPeerId)).toEqual([]);
  });

  it("drains legacy array signals alongside independent signal entries", async () => {
    const kv = new MemoryKv({ withList: true });
    const roomCode = "654321";
    const targetPeerId = "host";

    kv.values.set(
      signalKey(roomCode, targetPeerId),
      JSON.stringify([
        {
          id: "legacy-signal",
          roomCode,
          createdAt: 1,
          type: "answer",
          peerId: "guest",
          targetPeerId,
          payload: { type: "answer", sdp: "legacy-answer" },
        },
      ]),
    );
    await appendSignal(kv, roomCode, targetPeerId, {
      type: "ice",
      peerId: "guest",
      targetPeerId,
      payload: { candidate: "new-candidate" },
    });

    const drained = await drainSignals(kv, roomCode, targetPeerId);
    expect(drained.map((signal) => signal.type)).toEqual(["answer", "ice"]);
    expect(kv.values.size).toBe(0);
  });
});

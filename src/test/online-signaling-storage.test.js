import { describe, expect, it } from "vitest";
import { appendEvent, drainEvents, eventKey } from "../../functions/api/rooms/_shared.js";
import { onRequestPost as createRoom } from "../../functions/api/rooms/index.js";
import { onRequestGet as getEvents, onRequestPost as postEvent } from "../../functions/api/rooms/[roomCode]/events/index.js";
import { onRequestPost as joinRoom } from "../../functions/api/rooms/[roomCode]/index.js";

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

function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function jsonBody(response) {
  return response.json();
}

async function createRoomWithGuest(kv) {
  const env = { ROOMS_KV: kv };
  const created = await jsonBody(
    await createRoom({
      request: jsonRequest("https://local.test/api/rooms", { nickname: "房主" }),
      env,
    }),
  );
  const joined = await jsonBody(
    await joinRoom({
      request: jsonRequest(`https://local.test/api/rooms/${created.roomCode}`, { nickname: "玩家" }),
      env,
      params: { roomCode: created.roomCode },
    }),
  );
  return { env, created, joined };
}

async function drainPeerEvents(env, roomCode, peerId) {
  const response = await getEvents({
    request: new Request(`https://local.test/api/rooms/${roomCode}/events?peerId=${encodeURIComponent(peerId)}`),
    env,
    params: { roomCode },
  });
  return jsonBody(response);
}

describe("online room relay storage", () => {
  it("stores list-capable event queues as independent entries", async () => {
    const kv = new MemoryKv({ withList: true });
    const roomCode = "123456";
    const targetPeerId = "guest";
    const requestIds = ["action-a", "action-b", "action-c"];

    await Promise.all(
      requestIds.map((requestId) =>
        appendEvent(kv, roomCode, targetPeerId, {
          peerId: "host",
          targetPeerId,
          message: {
            type: "actionAccepted",
            requestId,
            turn: 1,
          },
        }),
      ),
    );

    expect(kv.values.has(eventKey(roomCode, targetPeerId))).toBe(false);

    const drained = await drainEvents(kv, roomCode, targetPeerId);
    expect(drained).toHaveLength(3);
    expect(drained.map((event) => event.message.requestId).sort()).toEqual(requestIds);
    expect(await drainEvents(kv, roomCode, targetPeerId)).toEqual([]);
  });

  it("drains legacy array events alongside independent event entries", async () => {
    const kv = new MemoryKv({ withList: true });
    const roomCode = "654321";
    const targetPeerId = "host";

    kv.values.set(
      eventKey(roomCode, targetPeerId),
      JSON.stringify([
        {
          id: "legacy-event",
          roomCode,
          createdAt: 1,
          peerId: "guest",
          targetPeerId,
          message: { type: "syncRequest", seat: 1 },
        },
      ]),
    );
    await appendEvent(kv, roomCode, targetPeerId, {
      peerId: "guest",
      targetPeerId,
      message: {
        type: "playerAction",
        requestId: "new-action",
        action: { type: "discard", seat: 1, tileId: "tile-1" },
      },
    });

    const drained = await drainEvents(kv, roomCode, targetPeerId);
    expect(drained.map((event) => event.message.type)).toEqual(["syncRequest", "playerAction"]);
    expect(kv.values.size).toBe(0);
  });
});

describe("online room relay endpoints", () => {
  it("rejects event writes with an invalid token", async () => {
    const kv = new MemoryKv({ withList: true });
    const { env, created, joined } = await createRoomWithGuest(kv);

    const response = await postEvent({
      request: jsonRequest(`https://local.test/api/rooms/${created.roomCode}/events`, {
        token: "bad-token",
        peerId: joined.peerId,
        targetPeerId: created.hostPeerId,
        message: {
          type: "playerAction",
          requestId: "bad-action",
          action: { type: "discard", seat: joined.seat, tileId: "tile-1" },
        },
      }),
      env,
      params: { roomCode: created.roomCode },
    });

    expect(response.status).toBe(403);
    expect(await drainPeerEvents(env, created.roomCode, created.hostPeerId)).toEqual([]);
  });

  it("lets the host read a guest action and deletes it after reading", async () => {
    const kv = new MemoryKv({ withList: true });
    const { env, created, joined } = await createRoomWithGuest(kv);

    const writeResponse = await postEvent({
      request: jsonRequest(`https://local.test/api/rooms/${created.roomCode}/events`, {
        token: joined.guestToken,
        peerId: joined.peerId,
        targetPeerId: created.hostPeerId,
        message: {
          type: "playerAction",
          requestId: "discard-1",
          action: { type: "discard", seat: joined.seat, tileId: "tile-1" },
        },
      }),
      env,
      params: { roomCode: created.roomCode },
    });

    expect(writeResponse.status).toBe(200);

    const events = await drainPeerEvents(env, created.roomCode, created.hostPeerId);
    expect(events).toHaveLength(1);
    expect(events[0].peerId).toBe(joined.peerId);
    expect(events[0].message).toMatchObject({
      type: "playerAction",
      requestId: "discard-1",
      action: { type: "discard", seat: joined.seat, tileId: "tile-1" },
    });
    expect(await drainPeerEvents(env, created.roomCode, created.hostPeerId)).toEqual([]);
  });

  it("lets a guest read host seat and snapshot events", async () => {
    const kv = new MemoryKv({ withList: true });
    const { env, created, joined } = await createRoomWithGuest(kv);

    await postEvent({
      request: jsonRequest(`https://local.test/api/rooms/${created.roomCode}/events`, {
        token: created.hostToken,
        peerId: created.peerId,
        targetPeerId: joined.peerId,
        message: {
          type: "seatAssigned",
          peerId: joined.peerId,
          seat: joined.seat,
          nickname: "玩家",
        },
      }),
      env,
      params: { roomCode: created.roomCode },
    });
    await postEvent({
      request: jsonRequest(`https://local.test/api/rooms/${created.roomCode}/events`, {
        token: created.hostToken,
        peerId: created.peerId,
        targetPeerId: joined.peerId,
        message: {
          type: "stateSnapshot",
          roomCode: created.roomCode,
          turn: 3,
          state: { roomId: created.roomCode, turn: 3 },
        },
      }),
      env,
      params: { roomCode: created.roomCode },
    });

    const events = await drainPeerEvents(env, created.roomCode, joined.peerId);
    expect(events.map((event) => event.message.type).sort()).toEqual(["seatAssigned", "stateSnapshot"]);
    expect(events.find((event) => event.message.type === "stateSnapshot")?.message).toMatchObject({
      type: "stateSnapshot",
      roomCode: created.roomCode,
      turn: 3,
    });
  });
});

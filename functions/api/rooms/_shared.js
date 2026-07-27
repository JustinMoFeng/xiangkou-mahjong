const ROOM_TTL_SECONDS = 10 * 60;
const SIGNAL_TTL_SECONDS = 30 * 60;
const BLOB_STORE_NAME = "xiangkou-mahjong-rooms";
const BLOB_ENTRY_VERSION = 1;

let pagesBlobStorePromise;

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isKvLike(value) {
  return value && typeof value.get === "function" && typeof value.put === "function" && typeof value.delete === "function";
}

async function getPagesBlobStore() {
  if (!pagesBlobStorePromise) {
    pagesBlobStorePromise = import("@edgeone/pages-blob").then(({ getStore }) =>
      getStore({ name: BLOB_STORE_NAME, consistency: "strong" }),
    );
  }
  return pagesBlobStorePromise;
}

function ttlExpiresAt(ttlSeconds) {
  const ttl = Number(ttlSeconds);
  return Number.isFinite(ttl) && ttl > 0 ? now() + ttl * 1000 : undefined;
}

function createPagesBlobKv() {
  return {
    async get(key) {
      const store = await getPagesBlobStore();
      const entry = await store.get(key, { type: "json", consistency: "strong" });

      if (!entry) return null;

      if (entry.__roomsBlobVersion === BLOB_ENTRY_VERSION) {
        if (typeof entry.expiresAt === "number" && entry.expiresAt <= now()) {
          await store.delete(key);
          return null;
        }
        return typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
      }

      return typeof entry === "string" ? entry : JSON.stringify(entry);
    },
    async put(key, value, options = {}) {
      const store = await getPagesBlobStore();
      await store.setJSON(
        key,
        {
          __roomsBlobVersion: BLOB_ENTRY_VERSION,
          value,
          expiresAt: ttlExpiresAt(options.expirationTtl),
          storedAt: now(),
        },
        { cacheControl: "no-store" },
      );
    },
    async delete(key) {
      const store = await getPagesBlobStore();
      await store.delete(key);
    },
  };
}

export function getKv(env) {
  const kv = env?.ROOMS_KV ?? env?.room_kv ?? env?.rooms_kv ?? env?.KV ?? env?.kv;
  if (isKvLike(kv)) {
    return kv;
  }
  return createPagesBlobKv();
}

export async function kvGetJson(kv, key) {
  const text = await kv.get(key);
  return text ? JSON.parse(text) : undefined;
}

export async function kvPutJson(kv, key, value, ttlSeconds = ROOM_TTL_SECONDS) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export function normalizeRoomCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function createRoomCode() {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join("");
}

export function createToken(prefix) {
  const random = crypto.getRandomValues(new Uint8Array(12));
  const encoded = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${encoded}`;
}

export function now() {
  return Date.now();
}

export function roomKey(roomCode) {
  return `room:${roomCode}`;
}

export function signalKey(roomCode, peerId) {
  return `signals:${roomCode}:${peerId}`;
}

export function roomPublicInfo(room) {
  return {
    roomCode: room.roomCode,
    hostPeerId: room.hostPeerId,
    guestCount: room.guests.length,
    guests: room.guests.map((guest) => ({
      peerId: guest.peerId,
      seat: guest.seat,
      nickname: guest.nickname,
      joinedAt: guest.joinedAt,
    })),
    status: room.status,
    expiresAt: room.expiresAt,
  };
}

export function validateRoom(room) {
  if (!room || room.expiresAt < now()) {
    return undefined;
  }
  return room;
}

export async function getRoomOr404(kv, roomCode) {
  const room = validateRoom(await kvGetJson(kv, roomKey(roomCode)));
  if (!room) {
    return [undefined, json({ error: "房间不存在或已过期" }, { status: 404 })];
  }
  return [room, undefined];
}

export function canUseToken(room, token) {
  return room.hostToken === token || room.guests.some((guest) => guest.guestToken === token);
}

export async function appendSignal(kv, roomCode, targetPeerId, signal) {
  const key = signalKey(roomCode, targetPeerId);
  const existing = (await kvGetJson(kv, key)) ?? [];
  existing.push({
    id: createToken("sig"),
    roomCode,
    createdAt: now(),
    ...signal,
  });
  await kvPutJson(kv, key, existing.slice(-80), SIGNAL_TTL_SECONDS);
}

export async function drainSignals(kv, roomCode, peerId) {
  const key = signalKey(roomCode, peerId);
  const signals = (await kvGetJson(kv, key)) ?? [];
  await kv.delete(key);
  return signals;
}

export { ROOM_TTL_SECONDS, SIGNAL_TTL_SECONDS };

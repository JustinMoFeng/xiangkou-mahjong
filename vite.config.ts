import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export default defineConfig({
  base: env?.VITE_BASE_PATH ?? "/",
  plugins: [react(), localRoomsApi()],
});

type LocalGuest = {
  peerId: string;
  guestToken: string;
  nickname: string;
  seat: number;
  joinedAt: number;
};

type LocalSignal = {
  id: string;
  roomCode: string;
  createdAt: number;
  type: "offer" | "answer" | "ice";
  peerId: string;
  targetPeerId?: string;
  payload: unknown;
};

type LocalRoom = {
  roomCode: string;
  hostToken: string;
  hostPeerId: string;
  hostNickname: string;
  guests: LocalGuest[];
  status: "waiting" | "playing";
  createdAt: number;
  expiresAt: number;
};

function localRoomsApi() {
  const rooms = new Map<string, LocalRoom>();
  const signals = new Map<string, LocalSignal[]>();

  function sendJson(res: { statusCode?: number; setHeader: (name: string, value: string) => void; end: (data: string) => void }, data: unknown, status = 200) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(data));
  }

  function roomInfo(room: LocalRoom) {
    return {
      roomCode: room.roomCode,
      hostPeerId: room.hostPeerId,
      guestCount: room.guests.length,
      guests: room.guests.map(({ guestToken: _guestToken, ...guest }) => guest),
      status: room.status,
      expiresAt: room.expiresAt,
    };
  }

  function code() {
    return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join("");
  }

  function token(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async function readBody(req: { on: (event: string, handler: (chunk?: unknown) => void) => void }) {
    const chunks: string[] = [];
    await new Promise<void>((resolve) => {
      req.on("data", (chunk) => {
        if (chunk) chunks.push(String(chunk));
      });
      req.on("end", () => resolve());
    });

    if (chunks.length === 0) return {};
    try {
      return JSON.parse(chunks.join("")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function getRoom(roomCode: string) {
    const room = rooms.get(roomCode);
    if (!room || room.expiresAt < Date.now()) {
      rooms.delete(roomCode);
      return undefined;
    }
    return room;
  }

  function signalKey(roomCode: string, peerId: string) {
    return `${roomCode}:${peerId}`;
  }

  function appendSignal(roomCode: string, targetPeerId: string, signal: Omit<LocalSignal, "id" | "roomCode" | "createdAt">) {
    const key = signalKey(roomCode, targetPeerId);
    const next = signals.get(key) ?? [];
    next.push({
      id: token("sig"),
      roomCode,
      createdAt: Date.now(),
      ...signal,
    });
    signals.set(key, next.slice(-80));
  }

  function splitRequestUrl(rawUrl: string | undefined) {
    const value = rawUrl ?? "/";
    const [pathname, search = ""] = value.split("?");
    return { pathname, search };
  }

  function searchParam(search: string, name: string) {
    for (const item of search.split("&")) {
      const [key, rawValue = ""] = item.split("=");
      if (decodeURIComponent(key) === name) {
        return decodeURIComponent(rawValue.replace(/\+/g, " "));
      }
    }
    return undefined;
  }

  return {
    name: "local-rooms-api",
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any) => void) => void } }) {
      server.middlewares.use("/api/rooms", async (req, res) => {
        const requestUrl = splitRequestUrl(req.url);
        const parts = requestUrl.pathname.split("/").filter(Boolean);
        const method = req.method ?? "GET";

        if (parts.length === 0 && method === "POST") {
          const body = await readBody(req);
          let roomCode = code();
          while (rooms.has(roomCode)) roomCode = code();
          const room: LocalRoom = {
            roomCode,
            hostToken: token("host"),
            hostPeerId: token("hostPeer"),
            hostNickname: String(body.nickname ?? "房主").trim().slice(0, 16) || "房主",
            guests: [],
            status: "waiting",
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
          };
          rooms.set(roomCode, room);
          sendJson(res, { ...roomInfo(room), hostToken: room.hostToken, peerId: room.hostPeerId });
          return;
        }

        const roomCode = String(parts[0] ?? "").trim().toUpperCase().slice(0, 6);
        const room = getRoom(roomCode);
        if (!room) {
          sendJson(res, { error: "房间不存在或已过期" }, 404);
          return;
        }

        if (parts.length === 1 && method === "GET") {
          sendJson(res, roomInfo(room));
          return;
        }

        if (parts.length === 1 && method === "POST") {
          const body = await readBody(req);
          if (room.guests.length >= 3) {
            sendJson(res, { error: "房间已满" }, 409);
            return;
          }
          const occupied = new Set(room.guests.map((guest) => guest.seat));
          const seat = [1, 2, 3].find((candidate) => !occupied.has(candidate));
          if (!seat) {
            sendJson(res, { error: "房间已满" }, 409);
            return;
          }
          const guest: LocalGuest = {
            peerId: token("guestPeer"),
            guestToken: token("guest"),
            nickname: String(body.nickname ?? "玩家").trim().slice(0, 16) || "玩家",
            seat,
            joinedAt: Date.now(),
          };
          room.guests.push(guest);
          room.expiresAt = Date.now() + 30 * 60 * 1000;
          sendJson(res, { ...roomInfo(room), guestToken: guest.guestToken, peerId: guest.peerId, seat: guest.seat });
          return;
        }

        const action = parts[1];
        const body = method === "POST" ? await readBody(req) : {};

        if (action === "offer" && method === "POST") {
          if (body.hostToken !== room.hostToken || !body.offer || !body.peerId || !body.targetPeerId) {
            sendJson(res, { error: "offer 信令无效" }, 400);
            return;
          }
          appendSignal(roomCode, String(body.targetPeerId), {
            type: "offer",
            peerId: String(body.peerId),
            targetPeerId: String(body.targetPeerId),
            payload: body.offer,
          });
          sendJson(res, { ok: true });
          return;
        }

        if (action === "answer" && method === "POST") {
          const guest = room.guests.find((item) => item.guestToken === body.guestToken && item.seat === body.seat);
          if (!guest || !body.answer || !body.peerId || !body.targetPeerId) {
            sendJson(res, { error: "answer 信令无效" }, 400);
            return;
          }
          appendSignal(roomCode, String(body.targetPeerId), {
            type: "answer",
            peerId: String(body.peerId),
            targetPeerId: String(body.targetPeerId),
            payload: body.answer,
          });
          sendJson(res, { ok: true });
          return;
        }

        if (action === "ice" && method === "POST") {
          const tokenValue = body.token;
          const canUseToken = room.hostToken === tokenValue || room.guests.some((guest) => guest.guestToken === tokenValue);
          if (!canUseToken || !body.peerId || !Array.isArray(body.candidates)) {
            sendJson(res, { error: "ICE 信令无效" }, 400);
            return;
          }
          const targetPeerId = String(body.targetPeerId || room.hostPeerId);
          for (const candidate of body.candidates) {
            appendSignal(roomCode, targetPeerId, {
              type: "ice",
              peerId: String(body.peerId),
              targetPeerId,
              payload: candidate,
            });
          }
          sendJson(res, { ok: true });
          return;
        }

        if (action === "signals" && method === "GET") {
          const peerId = searchParam(requestUrl.search, "peerId");
          if (!peerId) {
            sendJson(res, { error: "缺少 peerId" }, 400);
            return;
          }
          const key = signalKey(roomCode, peerId);
          const queued = signals.get(key) ?? [];
          signals.delete(key);
          sendJson(res, queued);
          return;
        }

        sendJson(res, { error: "Not found" }, 404);
      });
    },
  };
}

import { GameRoom } from "./GameRoom";

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function createRoomCode(): string {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join("");
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function roomStub(env: Env, roomCode: string): DurableObjectStub {
  const id = env.GAME_ROOM.idFromName(`room:${roomCode}`);
  return env.GAME_ROOM.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Create a room: POST /api/rooms[?kind=xiangkou|sichuan]  →  { roomCode, kind }
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const kind = url.searchParams.get("kind") === "sichuan" ? "sichuan" : "xiangkou";
      const roomCode = createRoomCode();
      const stub = roomStub(env, roomCode);
      const createUrl = new URL(request.url);
      createUrl.pathname = "/create";
      createUrl.searchParams.set("roomCode", roomCode);
      createUrl.searchParams.set("kind", kind);
      const created = await stub.fetch(new Request(createUrl.toString(), { method: "POST" }));
      return withCors(created);
    }

    // Room-scoped routes: /api/rooms/:code(/ws|/info)
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/ws|\/info)?$/);
    if (match) {
      const roomCode = normalizeRoomCode(match[1]);
      const suffix = match[2] ?? "/info";
      if (roomCode.length !== 6) {
        return withCors(new Response(JSON.stringify({ error: "房间号无效" }), { status: 400 }));
      }

      const stub = roomStub(env, roomCode);
      const forwardUrl = new URL(request.url);
      forwardUrl.pathname = suffix;
      const forwarded = stub.fetch(new Request(forwardUrl.toString(), request));

      // WebSocket upgrades must be returned as-is (no header rewrite).
      if (suffix === "/ws") {
        return forwarded;
      }
      return withCors(await forwarded);
    }

    // Everything else: serve the built SPA (with history fallback for routing).
    return env.ASSETS.fetch(request);
  },
};

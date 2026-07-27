import {
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "./cloudProtocol";

export type CloudTransportEvents = {
  onOpen?: () => void;
  onMessage?: (message: ServerMessage) => void;
  onClose?: () => void;
};

export type CloudTransport = {
  send: (message: ClientMessage) => boolean;
  close: () => void;
};

/** Base origin for the Cloudflare Worker. Same-origin in prod; dev points at wrangler. */
export function cloudApiBase(): string {
  const configured = import.meta.env.VITE_CF_API_ORIGIN as string | undefined;
  return (configured ?? "").replace(/\/+$/, "");
}

function wsUrl(roomCode: string, clientId: string): string {
  const base = cloudApiBase();
  const origin = base || window.location.origin;
  const url = new URL(`/api/rooms/${roomCode}/ws`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = cloudApiBase();
  return fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function createCloudRoom(kind: "xiangkou" | "sichuan" = "xiangkou"): Promise<{ roomCode: string }> {
  const response = await apiFetch(`/api/rooms?kind=${kind}`, { method: "POST", body: "{}" });
  const payload = (await response.json()) as { roomCode?: string; error?: string };
  if (!response.ok || !payload.roomCode) {
    throw new Error(payload.error ?? "创建房间失败");
  }
  return { roomCode: payload.roomCode };
}

export async function getCloudRoom(roomCode: string): Promise<{ roomCode: string; status: string; kind?: string }> {
  const response = await apiFetch(`/api/rooms/${roomCode}/info`);
  const payload = (await response.json()) as { roomCode?: string; status?: string; kind?: string; error?: string };
  if (!response.ok || !payload.roomCode) {
    throw new Error(payload.error ?? "房间不存在或已过期");
  }
  return { roomCode: payload.roomCode, status: payload.status ?? "waiting", kind: payload.kind };
}

/**
 * Open a resilient WebSocket to a room. Reconnects with backoff; on every
 * (re)open the caller's `onOpen` should re-send `join` so the DO restores the
 * seat and pushes the current snapshot.
 */
export function connectCloudRoom(
  roomCode: string,
  clientId: string,
  events: CloudTransportEvents,
): CloudTransport {
  let socket: WebSocket | undefined;
  let closed = false;
  let retry = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function open() {
    if (closed) return;
    socket = new WebSocket(wsUrl(roomCode, clientId));

    socket.addEventListener("open", () => {
      retry = 0;
      events.onOpen?.();
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = decodeServerMessage(event.data);
      if (message) events.onMessage?.(message);
    });

    const scheduleReconnect = () => {
      events.onClose?.();
      if (closed) return;
      retry += 1;
      const delay = Math.min(500 * 2 ** (retry - 1), 5000);
      reconnectTimer = setTimeout(open, delay);
    };

    socket.addEventListener("close", scheduleReconnect);
    socket.addEventListener("error", () => socket?.close());
  }

  open();

  return {
    send(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(encodeClientMessage(message));
      return true;
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}

export function createClientId(): string {
  const key = "xiangkou-cloud-client-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = `cid-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  localStorage.setItem(key, id);
  return id;
}

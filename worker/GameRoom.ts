import type { Seat, SeatType } from "../src/game/types";
import {
  decodeClientMessage,
  encodeServerMessage,
  type LobbySeat,
  type RoomStatus,
  type ServerMessage,
} from "../src/online/cloudProtocol";
import { getAdapter, normalizeKind, type GameAdapter, type GameKind } from "./adapters";

type PersistedRoom = {
  roomCode: string;
  kind: GameKind;
  status: RoomStatus;
  /** clientId per seat; seat 0 is the room creator (host). */
  occupants: Record<number, { clientId: string; nickname: string }>;
  state?: unknown;
};

const ROOM_KEY = "room";
const SEATS: Seat[] = [0, 1, 2, 3];
const HOST_SEAT: Seat = 0;

/**
 * One `GameRoom` Durable Object == one mahjong table. It owns the authoritative
 * game state, assigns seats, runs the bot/auto-draw loop with `setTimeout`, and
 * broadcasts per-seat masked snapshots over WebSocket. The concrete game
 * (Xiangkou / Sichuan) is chosen at create time via a `GameAdapter`.
 */
export class GameRoom {
  private readonly state: DurableObjectState;
  private room?: PersistedRoom;
  // seat -> live socket. Kept in memory; rebuilt from re-joins after eviction.
  private readonly sockets = new Map<Seat, WebSocket>();
  private loopTimer?: ReturnType<typeof setTimeout>;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/ws")) {
      return this.handleWebSocket(request, url);
    }
    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      return this.handleCreate(url);
    }
    if (request.method === "GET" && url.pathname.endsWith("/info")) {
      return this.handleInfo();
    }
    return json({ error: "未知的房间请求" }, 404);
  }

  private adapter(): GameAdapter<unknown> {
    return getAdapter(this.room?.kind ?? "xiangkou");
  }

  private async load(): Promise<PersistedRoom | undefined> {
    if (!this.room) {
      this.room = await this.state.storage.get<PersistedRoom>(ROOM_KEY);
    }
    return this.room;
  }

  private async persist(): Promise<void> {
    if (this.room) {
      await this.state.storage.put(ROOM_KEY, this.room);
    }
  }

  private async handleCreate(url: URL): Promise<Response> {
    const roomCode = url.searchParams.get("roomCode") ?? "";
    const kind = normalizeKind(url.searchParams.get("kind"));
    const existing = await this.load();
    if (existing) {
      return json({ roomCode: existing.roomCode, kind: existing.kind, status: existing.status });
    }

    this.room = { roomCode, kind, status: "waiting", occupants: {} };
    await this.persist();
    return json({ roomCode, kind, status: "waiting" });
  }

  private async handleInfo(): Promise<Response> {
    const room = await this.load();
    if (!room) {
      return json({ error: "房间不存在或已过期" }, 404);
    }
    return json({ roomCode: room.roomCode, kind: room.kind, status: room.status, seats: this.lobbySeats() });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "需要 WebSocket 升级" }, 426);
    }
    const room = await this.load();
    if (!room) {
      return json({ error: "房间不存在或已过期" }, 404);
    }
    const clientId = url.searchParams.get("clientId") ?? "";
    if (!clientId) {
      return json({ error: "缺少 clientId" }, 400);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.wireSocket(server, clientId);

    return new Response(null, { status: 101, webSocket: client });
  }

  private wireSocket(socket: WebSocket, clientId: string): void {
    socket.addEventListener("message", (event) => {
      void this.onMessage(socket, clientId, event.data);
    });

    const drop = () => {
      for (const [seat, active] of this.sockets) {
        if (active === socket) {
          this.sockets.delete(seat);
          this.broadcastLobby();
        }
      }
    };
    socket.addEventListener("close", drop);
    socket.addEventListener("error", drop);
  }

  private async onMessage(socket: WebSocket, clientId: string, raw: unknown): Promise<void> {
    if (typeof raw !== "string") {
      return;
    }
    const message = decodeClientMessage(raw);
    const room = await this.load();
    if (!message || !room) {
      return;
    }

    if (message.type === "join") {
      await this.onJoin(socket, clientId, message.nickname);
      return;
    }

    const seat = this.seatForClient(clientId);
    if (seat === undefined) {
      send(socket, { type: "error", reason: "尚未入座" });
      return;
    }

    if (message.type === "start") {
      await this.onStart(seat);
      return;
    }
    if (message.type === "sync") {
      this.sendSnapshot(seat);
      return;
    }
    if (message.type === "action") {
      await this.onAction(seat, message.requestId, message.action, socket);
    }
  }

  private async onJoin(socket: WebSocket, clientId: string, nickname: string): Promise<void> {
    const room = this.room!;
    const cleaned = nickname.trim().slice(0, 16) || "玩家";

    let seat = this.seatForClient(clientId);
    if (seat === undefined) {
      if (room.status !== "waiting") {
        send(socket, { type: "error", reason: "房间已经开始" });
        return;
      }
      seat = SEATS.find((candidate) => !room.occupants[candidate]);
      if (seat === undefined) {
        send(socket, { type: "error", reason: "房间已满" });
        return;
      }
    }
    room.occupants[seat] = { clientId, nickname: cleaned };
    await this.persist();

    this.sockets.set(seat, socket);

    send(socket, {
      type: "welcome",
      seat,
      isHost: seat === HOST_SEAT,
      roomCode: room.roomCode,
      status: room.status,
      seats: this.lobbySeats(),
    });
    this.broadcastLobby();

    // A reconnect mid-game gets the current masked board immediately.
    if (room.status === "playing" && room.state !== undefined) {
      this.sendSnapshot(seat);
    }
  }

  private async onStart(seat: Seat): Promise<void> {
    const room = this.room!;
    if (seat !== HOST_SEAT) {
      const socket = this.sockets.get(seat);
      if (socket) send(socket, { type: "error", reason: "只有房主可以开始" });
      return;
    }
    if (room.status === "playing") {
      return;
    }

    const adapter = this.adapter();
    const names = [...adapter.defaultNames] as [string, string, string, string];
    const seatTypes: Partial<Record<Seat, SeatType>> = { 0: "human", 1: "bot", 2: "bot", 3: "bot" };
    for (const s of SEATS) {
      const occupant = room.occupants[s];
      if (occupant) {
        names[s] = occupant.nickname;
        seatTypes[s] = s === HOST_SEAT ? "human" : "remote";
      }
    }

    room.state = adapter.createGame({ roomCode: room.roomCode, seed: Date.now(), names, seatTypes });
    room.status = "playing";
    await this.persist();

    this.broadcastLobby();
    this.broadcastSnapshot();
    this.scheduleLoop();
  }

  private async onAction(
    seat: Seat,
    requestId: string,
    action: { seat: Seat } & Record<string, unknown>,
    socket: WebSocket,
  ): Promise<void> {
    const room = this.room!;
    if (room.status !== "playing" || room.state === undefined) {
      send(socket, { type: "actionRejected", requestId, reason: "本局尚未开始" });
      return;
    }
    if (action.seat !== seat) {
      send(socket, { type: "actionRejected", requestId, reason: "不能替其他座位操作" });
      return;
    }

    const result = this.adapter().applyAction(room.state, action);
    if (!result.ok) {
      send(socket, { type: "actionRejected", requestId, reason: result.reason });
      return;
    }

    room.state = result.state;
    await this.persist();
    this.broadcastSnapshot();
    this.scheduleLoop();
  }

  /** Drive bots / auto-draws forward, mirroring the browser's setTimeout cadence. */
  private scheduleLoop(): void {
    if (this.loopTimer) {
      return;
    }
    const room = this.room;
    if (room?.state === undefined || room.status !== "playing") {
      return;
    }

    const step = this.adapter().nextStep(room.state);
    if (!step) {
      return;
    }

    this.loopTimer = setTimeout(() => {
      this.loopTimer = undefined;
      void this.runLoopStep();
    }, step.delayMs);
  }

  private async runLoopStep(): Promise<void> {
    const room = this.room;
    if (room?.state === undefined || room.status !== "playing") {
      return;
    }
    const step = this.adapter().nextStep(room.state);
    if (!step) {
      return;
    }
    room.state = step.state;
    await this.persist();
    this.broadcastSnapshot();
    this.scheduleLoop();
  }

  private seatForClient(clientId: string): Seat | undefined {
    const room = this.room;
    if (!room) return undefined;
    for (const seat of SEATS) {
      if (room.occupants[seat]?.clientId === clientId) {
        return seat;
      }
    }
    return undefined;
  }

  private lobbySeats(): LobbySeat[] {
    const room = this.room;
    return SEATS.map((seat) => {
      const occupant = room?.occupants[seat];
      return {
        seat,
        nickname: occupant?.nickname ?? (seat === HOST_SEAT ? "房主" : "机器人补位"),
        connected: this.sockets.has(seat),
        isBot: !occupant && seat !== HOST_SEAT,
      };
    });
  }

  private sendSnapshot(seat: Seat): void {
    const room = this.room;
    const socket = this.sockets.get(seat);
    if (room?.state === undefined || !socket) {
      return;
    }
    const adapter = this.adapter();
    send(socket, {
      type: "snapshot",
      turn: adapter.getTurn(room.state),
      state: adapter.maskForSeat(room.state, seat) as never,
    });
  }

  private broadcastSnapshot(): void {
    for (const seat of this.sockets.keys()) {
      this.sendSnapshot(seat);
    }
  }

  private broadcastLobby(): void {
    const room = this.room;
    if (!room) return;
    const payload: ServerMessage = { type: "lobby", status: room.status, seats: this.lobbySeats() };
    for (const socket of this.sockets.values()) {
      send(socket, payload);
    }
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  try {
    socket.send(encodeServerMessage(message));
  } catch {
    // Socket may be closing; ignore.
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

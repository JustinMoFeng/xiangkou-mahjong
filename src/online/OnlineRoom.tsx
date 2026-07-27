import { ArrowLeft, Clipboard, Copy, Loader2, Play, RefreshCcw, Users } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { OnlineConnectionState, OnlineMessage } from "./protocol";
import { createRequestId, shouldApplyStateSnapshot } from "./protocol";
import { normalizeRoomCode, RoomRelayClient, type RoomEventEnvelope, type RoomInfo } from "./signaling";

export type SharedSeat = 0 | 1 | 2 | 3;

export type RoomGuest = {
  peerId: string;
  seat: SharedSeat;
  nickname: string;
  joinedAt: number;
  connected: boolean;
};

export type HostActionResult<TState> = {
  requestId: string;
  ok: boolean;
  reason?: string;
  state: TState;
};

type OnlineSnapshotState = Extract<OnlineMessage, { type: "stateSnapshot" }>["state"];
type PlayerSeatAction = { seat: SharedSeat };
type QueuedHostAction<TAction> = { requestId: string; action: TAction };

type OnlineRoomStrings = {
  gameTitle: string;
  createTitle: string;
  joinTitle: string;
  createDescription: string;
  joinDescription: string;
  hostFallbackName: string;
  guestFallbackName: string;
  botFillName: string;
};

type CreateRoomProps<TState extends OnlineSnapshotState, TAction extends PlayerSeatAction> = {
  strings: OnlineRoomStrings;
  onBackMode: () => void;
  createInitialState: (input: { roomCode: string; hostName: string; guests: RoomGuest[] }) => TState;
  getStateTurn: (state: TState) => number;
  maskStateForSeat: (state: TState, seat: SharedSeat) => TState;
  renderHostTable: (props: {
    state: TState;
    roomCode: string;
    incomingAction?: QueuedHostAction<TAction>;
    onHostStateChange: (state: TState) => void;
    onHostActionResult: (result: HostActionResult<TState>) => void;
    onLeaveRoom: () => void;
  }) => ReactNode;
};

type JoinRoomProps<TState extends OnlineSnapshotState, TAction extends PlayerSeatAction> = {
  strings: OnlineRoomStrings;
  initialRoomCode?: string;
  onBackMode: () => void;
  renderGuestTable: (props: {
    state: TState;
    roomCode: string;
    seat: SharedSeat;
    connectionState: OnlineConnectionState;
    onPlayerAction: (action: TAction) => void;
    onLeaveRoom: () => void;
  }) => ReactNode;
};

const client = new RoomRelayClient();

function toSeat(value: number | undefined, fallback: SharedSeat): SharedSeat {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

function roomGuests(info: RoomInfo): RoomGuest[] {
  return (info.guests ?? []).map((guest) => ({
    ...guest,
    seat: toSeat(guest.seat, 1),
    connected: true,
  }));
}

export function OnlineCreateRoom<TState extends OnlineSnapshotState, TAction extends PlayerSeatAction>({
  strings,
  onBackMode,
  createInitialState,
  getStateTurn,
  maskStateForSeat,
  renderHostTable,
}: CreateRoomProps<TState, TAction>) {
  const [nickname, setNickname] = useState(() => localStorage.getItem("xiangkou-online-nickname") ?? strings.hostFallbackName);
  const [roomInfo, setRoomInfo] = useState<RoomInfo>();
  const [guests, setGuests] = useState<RoomGuest[]>([]);
  const [hostState, setHostState] = useState<TState>();
  const [incomingAction, setIncomingAction] = useState<QueuedHostAction<TAction>>();
  const [status, setStatus] = useState<"idle" | "creating" | "waiting" | "playing" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const hostStateRef = useRef<TState>();
  const guestsRef = useRef<RoomGuest[]>([]);
  const incomingActionRef = useRef<QueuedHostAction<TAction>>();
  const actionQueueRef = useRef<QueuedHostAction<TAction>[]>([]);
  const pendingActionPeerRef = useRef<Map<string, string>>(new Map());
  const hostPeerId = roomInfo?.peerId ?? roomInfo?.hostPeerId;

  function updateGuests(nextGuests: RoomGuest[]) {
    guestsRef.current = nextGuests;
    setGuests(nextGuests);
  }

  useEffect(() => {
    hostStateRef.current = hostState;
  }, [hostState]);

  useEffect(() => {
    guestsRef.current = guests;
  }, [guests]);

  async function createRoom() {
    const name = nickname.trim() || strings.hostFallbackName;
    localStorage.setItem("xiangkou-online-nickname", name);
    setStatus("creating");
    setError("");

    try {
      const created = await client.createRoom(name);
      setRoomInfo(created);
      updateGuests([]);
      setStatus("waiting");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "创建房间失败");
    }
  }

  useEffect(() => {
    if (!roomInfo || status === "playing") {
      return undefined;
    }

    const activeRoomCode = roomInfo.roomCode;
    let stopped = false;

    async function tick() {
      try {
        const latest = await client.getRoom(activeRoomCode);
        if (stopped) return;
        updateGuests(roomGuests(latest));
      } catch (cause) {
        if (!stopped) {
          setError(cause instanceof Error ? cause.message : "刷新房间失败");
        }
      }
    }

    tick();
    const timer = window.setInterval(tick, 1800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [roomInfo, status]);

  useEffect(() => {
    if (!roomInfo || !hostPeerId) {
      return undefined;
    }

    const activeRoomCode = roomInfo.roomCode;
    const activeHostPeerId = hostPeerId;
    let stopped = false;

    async function pollEvents() {
      try {
        const events = await client.getEvents(activeRoomCode, activeHostPeerId);
        if (stopped) return;
        for (const event of events) {
          handleHostEvent(event);
        }
      } catch {
        if (!stopped) setError("事件同步中断，正在等待下一次轮询");
      }
    }

    pollEvents();
    const timer = window.setInterval(pollEvents, 900);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [hostPeerId, roomInfo]);

  function handleHostEvent(event: RoomEventEnvelope) {
    const message = event.message;
    if (message.type === "hello") {
      sendSeatAssigned(event.peerId);
      sendSnapshotToPeer(event.peerId, hostStateRef.current);
      return;
    }

    if (message.type === "syncRequest") {
      sendSnapshotToPeer(event.peerId, hostStateRef.current);
      return;
    }

    if (message.type !== "playerAction") {
      return;
    }

    const action = message.action as unknown as TAction;
    const guest = guestsRef.current.find((item) => item.peerId === event.peerId);
    if (!guest || action.seat !== guest.seat) {
      sendMessageToPeer(event.peerId, {
        type: "actionRejected",
        requestId: message.requestId,
        reason: "操作座位和房间座位不一致",
      });
      return;
    }

    pendingActionPeerRef.current.set(message.requestId, event.peerId);
    actionQueueRef.current.push({ requestId: message.requestId, action });
    promoteNextAction();
  }

  function promoteNextAction() {
    if (incomingActionRef.current) {
      return;
    }
    const next = actionQueueRef.current.shift();
    if (!next) {
      return;
    }
    incomingActionRef.current = next;
    setIncomingAction(next);
  }

  function sendMessageToPeer(peerId: string, message: OnlineMessage): boolean {
    if (!roomInfo || !roomInfo.hostToken || !hostPeerId) {
      return false;
    }

    client.postEvent(roomInfo.roomCode, roomInfo.hostToken, hostPeerId, peerId, message).catch(() => {
      setError("事件写入失败，正在等待下一次同步");
    });
    return true;
  }

  function sendSeatAssigned(peerId: string) {
    const record = guestsRef.current.find((guest) => guest.peerId === peerId);
    if (!record) return;
    sendSeatAssignedToGuest(record);
  }

  function sendSeatAssignedToGuest(record: RoomGuest) {
    sendMessageToPeer(record.peerId, {
      type: "seatAssigned",
      peerId: record.peerId,
      seat: record.seat,
      nickname: record.nickname,
    });
  }

  function sendSnapshotToPeer(peerId: string, state: TState | undefined) {
    const record = guestsRef.current.find((guest) => guest.peerId === peerId);
    if (!record || !state) return;
    sendSnapshotToGuest(record, state);
  }

  function sendSnapshotToGuest(record: RoomGuest, state: TState) {
    sendMessageToPeer(record.peerId, {
      type: "stateSnapshot",
      roomCode: roomInfo?.roomCode ?? "",
      turn: getStateTurn(state),
      state: maskStateForSeat(state, record.seat),
    });
  }

  function broadcastSnapshot(state: TState) {
    hostStateRef.current = state;
    for (const record of guestsRef.current) {
      sendSnapshotToPeer(record.peerId, state);
    }
  }

  function handleHostActionResult(result: HostActionResult<TState>) {
    const peerId = pendingActionPeerRef.current.get(result.requestId);
    pendingActionPeerRef.current.delete(result.requestId);

    if (peerId) {
      sendMessageToPeer(
        peerId,
        result.ok
          ? { type: "actionAccepted", requestId: result.requestId, turn: getStateTurn(result.state) }
          : { type: "actionRejected", requestId: result.requestId, reason: result.reason ?? "操作被拒绝" },
      );
    }

    if (result.ok) {
      broadcastSnapshot(result.state);
    }

    incomingActionRef.current = undefined;
    setIncomingAction(undefined);
    window.setTimeout(promoteNextAction, 0);
  }

  function startGame() {
    if (!roomInfo) return;
    const next = createInitialState({
      roomCode: roomInfo.roomCode,
      hostName: nickname.trim() || strings.hostFallbackName,
      guests,
    });
    setHostState(next);
    setStatus("playing");

    for (const guest of guestsRef.current.length > guests.length ? guestsRef.current : guests) {
      sendSeatAssignedToGuest(guest);
      sendSnapshotToGuest(guest, next);
    }
  }

  async function copyRoomCode() {
    if (!roomInfo) return;
    await navigator.clipboard?.writeText(roomInfo.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (status === "playing" && roomInfo && hostState) {
    return renderHostTable({
      state: hostState,
      roomCode: roomInfo.roomCode,
      incomingAction,
      onHostStateChange: (state) => {
        setHostState(state);
        broadcastSnapshot(state);
      },
      onHostActionResult: handleHostActionResult,
      onLeaveRoom: onBackMode,
    });
  }

  return (
    <main className="home-shell" aria-label={`创建${strings.gameTitle}朋友房间`}>
      <section className="home-frame room-frame">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackMode} aria-label="返回开桌方式">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">{strings.gameTitle} · 朋友房间</p>
            <h1>{strings.createTitle}</h1>
            <p className="home-sub">{strings.createDescription}</p>
          </div>
        </header>

        {!roomInfo ? (
          <form className="room-panel" onSubmit={(event) => event.preventDefault()}>
            <label className="room-field">
              <span>房主昵称</span>
              <input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} />
            </label>
            <button className="room-primary" type="button" disabled={status === "creating"} onClick={createRoom}>
              {status === "creating" ? <Loader2 size={18} className="room-spin" /> : <Users size={18} />}
              创建 6 位房间号
            </button>
            {error ? <p className="room-error">{error}</p> : null}
          </form>
        ) : (
          <section className="room-panel room-panel--lobby" aria-label="房间等待">
            <div className="room-code-block">
              <span>房间号</span>
              <strong>{roomInfo.roomCode}</strong>
              <button className="room-icon-button" type="button" onClick={copyRoomCode} aria-label="复制房间号" title="复制房间号">
                {copied ? <Clipboard size={18} /> : <Copy size={18} />}
              </button>
            </div>

            <div className="room-seats" aria-label="玩家座位">
              {([0, 1, 2, 3] as SharedSeat[]).map((seat) => {
                const guest = guests.find((item) => item.seat === seat);
                const label = seat === 0 ? nickname.trim() || strings.hostFallbackName : guest?.nickname ?? strings.botFillName;
                return (
                  <div className="room-seat" key={seat}>
                    <span>{seat === 0 ? "本家" : `${seat + 1} 号位`}</span>
                    <strong>{label}</strong>
                    <em>{seat === 0 ? "房主" : guest ? "已加入" : "空位"}</em>
                  </div>
                );
              })}
            </div>

            {error ? <p className="room-error">{error}</p> : null}
            <div className="room-actions">
              <button className="room-secondary" type="button" onClick={() => setError("")}>
                <RefreshCcw size={17} />
                继续等待
              </button>
              <button className="room-primary" type="button" onClick={startGame}>
                <Play size={18} />
                开始
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export function OnlineJoinRoom<TState extends OnlineSnapshotState, TAction extends PlayerSeatAction>({
  strings,
  initialRoomCode,
  onBackMode,
  renderGuestTable,
}: JoinRoomProps<TState, TAction>) {
  const [roomCode, setRoomCode] = useState(() => normalizeRoomCode(initialRoomCode ?? ""));
  const [nickname, setNickname] = useState(() => localStorage.getItem("xiangkou-online-nickname") ?? strings.guestFallbackName);
  const [joined, setJoined] = useState<RoomInfo>();
  const [tableState, setTableState] = useState<TState>();
  const [status, setStatus] = useState<"idle" | "joining" | "waiting" | "playing" | "error">("idle");
  const [connectionState, setConnectionState] = useState<OnlineConnectionState>("reconnecting");
  const [error, setError] = useState("");
  const guestPeerId = joined?.peerId;
  const guestToken = joined?.guestToken;
  const hostPeerId = joined?.hostPeerId;
  const seat = toSeat(joined?.seat, 1);

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault();
    const code = normalizeRoomCode(roomCode);
    const name = nickname.trim() || strings.guestFallbackName;
    if (code.length !== 6) {
      setError("请输入 6 位房间号");
      return;
    }

    setStatus("joining");
    setError("");
    localStorage.setItem("xiangkou-online-nickname", name);

    try {
      const info = await client.joinRoom(code, name);
      setJoined(info);
      setStatus("waiting");
      setConnectionState("guest");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "加入房间失败");
    }
  }

  useEffect(() => {
    if (!joined || !guestPeerId) {
      return undefined;
    }

    const activeRoomCode = joined.roomCode;
    const activeGuestPeerId = guestPeerId;
    let stopped = false;

    async function pollEvents() {
      try {
        const events = await client.getEvents(activeRoomCode, activeGuestPeerId);
        if (stopped) return;
        setConnectionState("guest");
        for (const event of events) {
          handleGuestMessage(event.message);
        }
      } catch {
        if (!stopped) {
          setConnectionState("reconnecting");
        }
      }
    }

    pollEvents();
    const timer = window.setInterval(pollEvents, 900);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [guestPeerId, joined]);

  function handleGuestMessage(message: OnlineMessage) {
    if (message.type === "seatAssigned") {
      setJoined((current) => (current ? { ...current, seat: message.seat } : current));
      return;
    }

    if (shouldApplyStateSnapshot("guest", message)) {
      setTableState(message.state as TState);
      setStatus("playing");
      return;
    }

    if (message.type === "actionRejected") {
      setError(message.reason);
      return;
    }

    if (message.type === "actionAccepted") {
      setError("");
    }
  }

  async function sendToHost(message: OnlineMessage): Promise<boolean> {
    if (!joined || !guestToken || !guestPeerId || !hostPeerId) {
      setConnectionState("reconnecting");
      setError("房间同步尚未就绪");
      return false;
    }

    try {
      await client.postEvent(joined.roomCode, guestToken, guestPeerId, hostPeerId, message);
      setConnectionState("guest");
      return true;
    } catch (cause) {
      setConnectionState("reconnecting");
      setError(cause instanceof Error ? cause.message : "操作发送失败");
      return false;
    }
  }

  async function sendPlayerAction(action: TAction) {
    await sendToHost({
      type: "playerAction",
      requestId: createRequestId(),
      action: action as unknown as Extract<OnlineMessage, { type: "playerAction" }>["action"],
    });
  }

  const roomTitle = useMemo(() => (roomCode ? `${strings.joinTitle} ${roomCode}` : strings.joinTitle), [roomCode, strings.joinTitle]);

  if (status === "playing" && joined && tableState) {
    return renderGuestTable({
      state: tableState,
      roomCode: joined.roomCode,
      seat,
      connectionState,
      onPlayerAction: sendPlayerAction,
      onLeaveRoom: onBackMode,
    });
  }

  return (
    <main className="home-shell" aria-label={`加入${strings.gameTitle}朋友房间`}>
      <section className="home-frame room-frame">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackMode} aria-label="返回开桌方式">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">{strings.gameTitle} · 朋友房间</p>
            <h1>{roomTitle}</h1>
            <p className="home-sub">{strings.joinDescription}</p>
          </div>
        </header>

        {!joined ? (
          <form className="room-panel" onSubmit={joinRoom}>
            <label className="room-field">
              <span>房间号</span>
              <input
                value={roomCode}
                maxLength={6}
                inputMode="text"
                onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                placeholder="例如 482913"
              />
            </label>
            <label className="room-field">
              <span>昵称</span>
              <input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} />
            </label>
            <button className="room-primary" type="submit" disabled={status === "joining"}>
              {status === "joining" ? <Loader2 size={18} className="room-spin" /> : <Users size={18} />}
              加入
            </button>
            {error ? <p className="room-error">{error}</p> : null}
          </form>
        ) : (
          <section className="room-panel room-panel--waiting" aria-label="等待房主开始">
            <div className="room-code-block">
              <span>房间号</span>
              <strong>{joined.roomCode}</strong>
              <em>{connectionState === "guest" ? "已加入房间" : "同步中"}</em>
            </div>
            <p className="room-waiting-text">你坐 {seat + 1} 号位。房主开始后会自动进入牌桌。</p>
            {error ? <p className="room-error">{error}</p> : null}
          </section>
        )}
      </section>
    </main>
  );
}

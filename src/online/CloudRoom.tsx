import { ArrowLeft, Clipboard, Copy, Loader2, Play, RefreshCcw, Users } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { Seat } from "../game/types";
import type { LobbySeat, ServerMessage } from "./cloudProtocol";
import { createRequestId, type OnlineConnectionState } from "./protocol";
import { normalizeRoomCode } from "./signaling";
import {
  connectCloudRoom,
  createClientId,
  createCloudRoom,
  getCloudRoom,
  type CloudTransport,
} from "./wsTransport";

export type CloudGameKind = "xiangkou" | "sichuan";

type Phase = "idle" | "connecting" | "lobby" | "playing" | "error";

type CloudRoomStrings = {
  eyebrow: string;
  createTitle: string;
  joinTitlePrefix: string;
  createDescription: string;
  joinDescription: string;
  hostFallbackName: string;
  guestFallbackName: string;
};

type RenderTableProps<TState, TAction> = {
  state: TState;
  roomCode: string;
  seat: Seat;
  connectionState: OnlineConnectionState;
  onPlayerAction: (action: TAction) => void;
  onLeaveRoom: () => void;
};

type CloudRoomProps<TState, TAction> = {
  kind: CloudGameKind;
  mode: "create" | "join";
  initialRoomCode?: string;
  onBackMode: () => void;
  strings: CloudRoomStrings;
  renderTable: (props: RenderTableProps<TState, TAction>) => ReactNode;
};

function toSeat(value: number | undefined, fallback: Seat): Seat {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

/**
 * Game-agnostic Cloudflare (server-authoritative) room UI. There is no host/guest
 * split for game logic: every client just sends actions and renders masked
 * snapshots pushed by the GameRoom Durable Object. Rendering is delegated to
 * `renderTable`, which mounts the game's own table component in "guest" mode.
 */
export function CloudRoom<TState, TAction>({
  kind,
  mode,
  initialRoomCode,
  onBackMode,
  strings,
  renderTable,
}: CloudRoomProps<TState, TAction>) {
  const [nickname, setNickname] = useState(
    () =>
      localStorage.getItem("xiangkou-online-nickname") ??
      (mode === "create" ? strings.hostFallbackName : strings.guestFallbackName),
  );
  const [roomCodeInput, setRoomCodeInput] = useState(() => normalizeRoomCode(initialRoomCode ?? ""));
  const [roomCode, setRoomCode] = useState<string>();
  const [seat, setSeat] = useState<Seat>(mode === "create" ? 0 : 1);
  const [isHost, setIsHost] = useState(mode === "create");
  const [seats, setSeats] = useState<LobbySeat[]>([]);
  const [tableState, setTableState] = useState<TState>();
  const [connectionState, setConnectionState] = useState<OnlineConnectionState>("reconnecting");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const transportRef = useRef<CloudTransport>();
  const clientIdRef = useRef<string>(createClientId());

  useEffect(() => {
    return () => transportRef.current?.close();
  }, []);

  function connect(code: string) {
    const name = nickname.trim() || (mode === "create" ? strings.hostFallbackName : strings.guestFallbackName);
    localStorage.setItem("xiangkou-online-nickname", name);
    transportRef.current?.close();

    const transport = connectCloudRoom(code, clientIdRef.current, {
      onOpen: () => {
        setConnectionState("guest");
        transport.send({ type: "join", clientId: clientIdRef.current, nickname: name });
      },
      onMessage: handleMessage,
      onClose: () => setConnectionState("reconnecting"),
    });
    transportRef.current = transport;
  }

  function handleMessage(message: ServerMessage) {
    switch (message.type) {
      case "welcome":
        setSeat(toSeat(message.seat, seat));
        setIsHost(message.isHost);
        setSeats(message.seats);
        setPhase((current) => (message.status === "playing" ? current : "lobby"));
        break;
      case "lobby":
        setSeats(message.seats);
        if (message.status === "waiting") {
          setPhase((current) => (current === "playing" ? current : "lobby"));
        }
        break;
      case "snapshot":
        setTableState(message.state as TState);
        setPhase("playing");
        break;
      case "actionRejected":
        setError(message.reason);
        break;
      case "error":
        setError(message.reason);
        break;
    }
  }

  async function createRoom() {
    setPhase("connecting");
    setError("");
    try {
      const { roomCode: code } = await createCloudRoom(kind);
      setRoomCode(code);
      connect(code);
    } catch (cause) {
      setPhase("error");
      setError(cause instanceof Error ? cause.message : "创建房间失败");
    }
  }

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault();
    const code = normalizeRoomCode(roomCodeInput);
    if (code.length !== 6) {
      setError("请输入 6 位房间号");
      return;
    }
    setPhase("connecting");
    setError("");
    try {
      await getCloudRoom(code);
      setRoomCode(code);
      connect(code);
    } catch (cause) {
      setPhase("error");
      setError(cause instanceof Error ? cause.message : "加入房间失败");
    }
  }

  function startGame() {
    transportRef.current?.send({ type: "start" });
  }

  function sendPlayerAction(action: TAction) {
    const ok = transportRef.current?.send({ type: "action", requestId: createRequestId(), action: action as never });
    if (!ok) {
      setConnectionState("reconnecting");
      setError("连接尚未恢复，操作未发送");
    }
  }

  async function copyRoomCode() {
    if (!roomCode) return;
    await navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (phase === "playing" && roomCode && tableState !== undefined) {
    return renderTable({
      state: tableState,
      roomCode,
      seat,
      connectionState,
      onPlayerAction: sendPlayerAction,
      onLeaveRoom: onBackMode,
    });
  }

  const title = mode === "create" ? strings.createTitle : roomCode ? `${strings.joinTitlePrefix} ${roomCode}` : strings.joinTitlePrefix;
  const description = mode === "create" ? strings.createDescription : strings.joinDescription;

  return (
    <main className="home-shell" aria-label={title}>
      <section className="home-frame room-frame">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackMode} aria-label="返回开桌方式">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">{strings.eyebrow}</p>
            <h1>{title}</h1>
            <p className="home-sub">{description}</p>
          </div>
        </header>

        {!roomCode ? (
          <form className="room-panel" onSubmit={mode === "join" ? joinRoom : (event) => event.preventDefault()}>
            {mode === "join" ? (
              <label className="room-field">
                <span>房间号</span>
                <input
                  value={roomCodeInput}
                  maxLength={6}
                  inputMode="text"
                  onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                  placeholder="例如 482913"
                />
              </label>
            ) : null}
            <label className="room-field">
              <span>{mode === "create" ? "房主昵称" : "昵称"}</span>
              <input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} />
            </label>
            <button
              className="room-primary"
              type={mode === "join" ? "submit" : "button"}
              disabled={phase === "connecting"}
              onClick={mode === "create" ? createRoom : undefined}
            >
              {phase === "connecting" ? <Loader2 size={18} className="room-spin" /> : <Users size={18} />}
              {mode === "create" ? "创建 6 位房间号" : "加入"}
            </button>
            {error ? <p className="room-error">{error}</p> : null}
          </form>
        ) : (
          <section className="room-panel room-panel--lobby" aria-label="房间等待">
            <div className="room-code-block">
              <span>房间号</span>
              <strong>{roomCode}</strong>
              <button className="room-icon-button" type="button" onClick={copyRoomCode} aria-label="复制房间号" title="复制房间号">
                {copied ? <Clipboard size={18} /> : <Copy size={18} />}
              </button>
            </div>

            <div className="room-seats" aria-label="玩家座位">
              {seats.map((info) => (
                <div className="room-seat" key={info.seat}>
                  <span>{info.seat === 0 ? "本家" : `${info.seat + 1} 号位`}</span>
                  <strong>{info.nickname}</strong>
                  <em>
                    {info.seat === 0 ? "房主" : info.isBot ? "空位" : info.connected ? "已连接" : "连接中"}
                  </em>
                </div>
              ))}
            </div>

            <p className="room-waiting-text">
              {connectionState === "guest" ? "已连接服务器。" : "连接中…"}
              {isHost ? "满意后点击开始，空座由机器人补齐。" : "等待房主开始，掉线会自动重连。"}
            </p>
            {error ? <p className="room-error">{error}</p> : null}

            <div className="room-actions">
              <button className="room-secondary" type="button" onClick={() => setError("")}>
                <RefreshCcw size={17} />
                继续等待
              </button>
              {isHost ? (
                <button className="room-primary" type="button" onClick={startGame}>
                  <Play size={18} />
                  开始
                </button>
              ) : null}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

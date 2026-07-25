import { ArrowLeft, Clipboard, Copy, Loader2, Play, RefreshCcw, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import App, { type OnlineTableConfig } from "../App";
import { createNewGame, DEFAULT_PLAYER_NAMES } from "../game/engine";
import type { GameState, Seat, SeatType } from "../game/types";
import { maskStateForSeat } from "./gameActions";
import {
  createRequestId,
  shouldApplyStateSnapshot,
  type OnlineConnectionState,
  type OnlineMessage,
  type PlayerAction,
} from "./protocol";
import { createPeerId, normalizeRoomCode, RoomSignalingClient, type RoomInfo } from "./signaling";
import { createGuestPeer, createHostPeer, type OnlinePeer } from "./webrtc";

type RoomGuest = {
  peerId: string;
  seat: Seat;
  nickname: string;
  joinedAt: number;
  connected: boolean;
};

type HostPeerRecord = RoomGuest & {
  peer: OnlinePeer;
};

const client = new RoomSignalingClient();

function toSeat(value: number | undefined, fallback: Seat): Seat {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

function onlineConnectionStateFromPeer(state: RTCPeerConnectionState): OnlineConnectionState {
  if (state === "connected") return "guest";
  if (state === "failed" || state === "closed") return "disconnected";
  return "reconnecting";
}

function openChannel(peer: OnlinePeer | undefined): boolean {
  return peer?.channel?.readyState === "open";
}

export function XiangkouCreateRoom({ onBackMode }: { onBackMode: () => void }) {
  const [nickname, setNickname] = useState(() => localStorage.getItem("xiangkou-online-nickname") ?? "房主");
  const [roomInfo, setRoomInfo] = useState<RoomInfo>();
  const [guests, setGuests] = useState<RoomGuest[]>([]);
  const [hostState, setHostState] = useState<GameState>();
  const [incomingAction, setIncomingAction] = useState<OnlineTableConfig["incomingAction"]>();
  const [status, setStatus] = useState<"idle" | "creating" | "waiting" | "playing" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const peersRef = useRef<Map<string, HostPeerRecord>>(new Map());
  const hostStateRef = useRef<GameState>();
  const pendingActionPeerRef = useRef<Map<string, string>>(new Map());
  const hostPeerId = roomInfo?.peerId ?? roomInfo?.hostPeerId;

  useEffect(() => {
    hostStateRef.current = hostState;
  }, [hostState]);

  useEffect(() => {
    return () => {
      for (const record of peersRef.current.values()) {
        record.peer.close();
      }
      peersRef.current.clear();
    };
  }, []);

  async function createRoom() {
    const name = nickname.trim() || "房主";
    localStorage.setItem("xiangkou-online-nickname", name);
    setStatus("creating");
    setError("");

    try {
      const created = await client.createRoom(name);
      setRoomInfo(created);
      setGuests([]);
      setStatus("waiting");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "创建房间失败");
    }
  }

  useEffect(() => {
    if (!roomInfo || !hostPeerId || !roomInfo.hostToken || status === "playing") {
      return undefined;
    }

    const activeRoomCode = roomInfo.roomCode;
    const activeHostToken = roomInfo.hostToken;
    const activeHostPeerId = hostPeerId;
    let stopped = false;

    async function tick() {
      try {
        const latest = await client.getRoom(activeRoomCode);
        if (stopped) return;
        const latestGuests = (latest.guests ?? []).map((guest) => ({
          ...guest,
          seat: toSeat(guest.seat, 1),
          connected: openChannel(peersRef.current.get(guest.peerId)?.peer),
        }));
        setGuests(latestGuests);

        for (const guest of latestGuests) {
          if (!peersRef.current.has(guest.peerId)) {
            await createHostConnection(activeRoomCode, activeHostToken, activeHostPeerId, guest);
          }
        }
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
  }, [hostPeerId, roomInfo, status]);

  useEffect(() => {
    if (!roomInfo || !hostPeerId) {
      return undefined;
    }

    const activeRoomCode = roomInfo.roomCode;
    const activeHostPeerId = hostPeerId;
    let stopped = false;

    async function pollSignals() {
      try {
        const signals = await client.getSignals(activeRoomCode, activeHostPeerId);
        for (const signal of signals) {
          if (signal.type === "answer") {
            const record = peersRef.current.get(signal.peerId);
            if (record) {
              await record.peer.peerConnection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            }
          }
          if (signal.type === "ice") {
            const record = peersRef.current.get(signal.peerId);
            if (record) {
              await record.peer.peerConnection.addIceCandidate(signal.payload as RTCIceCandidateInit);
            }
          }
        }
      } catch {
        if (!stopped) setError("信令同步中断，正在等待下一次轮询");
      }
    }

    pollSignals();
    const timer = window.setInterval(pollSignals, 1200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [hostPeerId, roomInfo]);

  async function createHostConnection(roomCode: string, hostToken: string, peerId: string, guest: RoomGuest) {
    const peer = createHostPeer({
      onChannelOpen: () => {
        setGuests((current) => current.map((item) => (item.peerId === guest.peerId ? { ...item, connected: true } : item)));
        sendSeatAssigned(guest.peerId);
        sendSnapshotToPeer(guest.peerId, hostStateRef.current);
      },
      onChannelClose: () => {
        setGuests((current) => current.map((item) => (item.peerId === guest.peerId ? { ...item, connected: false } : item)));
      },
      onConnectionState: (state) => {
        if (state === "failed" || state === "closed" || state === "disconnected") {
          setGuests((current) => current.map((item) => (item.peerId === guest.peerId ? { ...item, connected: false } : item)));
        }
      },
      onIceCandidate: (candidate) => {
        client.postIce(roomCode, hostToken, peerId, [candidate], guest.peerId).catch(() => {
          setError("ICE 信令写入失败");
        });
      },
      onMessage: (message) => handleHostMessage(guest.peerId, message),
    });

    peersRef.current.set(guest.peerId, { ...guest, peer });
    const offer = await peer.peerConnection.createOffer();
    await peer.peerConnection.setLocalDescription(offer);
    await client.postOffer(roomCode, hostToken, offer, peerId, guest.peerId);
  }

  function handleHostMessage(peerId: string, message: OnlineMessage) {
    if (message.type === "hello") {
      sendSeatAssigned(peerId);
      sendSnapshotToPeer(peerId, hostStateRef.current);
      return;
    }

    if (message.type === "syncRequest") {
      sendSnapshotToPeer(peerId, hostStateRef.current);
      return;
    }

    if (message.type !== "playerAction") {
      return;
    }

    pendingActionPeerRef.current.set(message.requestId, peerId);
    setIncomingAction({ requestId: message.requestId, action: message.action as PlayerAction });
  }

  function sendSeatAssigned(peerId: string) {
    const record = peersRef.current.get(peerId);
    if (!record) return;
    record.peer.send({
      type: "seatAssigned",
      peerId,
      seat: record.seat,
      nickname: record.nickname,
    });
  }

  function sendSnapshotToPeer(peerId: string, state: GameState | undefined) {
    const record = peersRef.current.get(peerId);
    if (!record || !state) return;
    record.peer.send({
      type: "stateSnapshot",
      roomCode: roomInfo?.roomCode ?? state.roomId ?? "",
      turn: state.turn,
      state: maskStateForSeat(state, record.seat),
    });
  }

  function broadcastSnapshot(state: GameState) {
    hostStateRef.current = state;
    for (const record of peersRef.current.values()) {
      sendSnapshotToPeer(record.peerId, state);
    }
  }

  function handleHostActionResult(result: { requestId: string; ok: boolean; reason?: string; state: GameState }) {
    const peerId = pendingActionPeerRef.current.get(result.requestId);
    pendingActionPeerRef.current.delete(result.requestId);
    const peer = peerId ? peersRef.current.get(peerId)?.peer : undefined;

    peer?.send(
      result.ok
        ? { type: "actionAccepted", requestId: result.requestId, turn: result.state.turn }
        : { type: "actionRejected", requestId: result.requestId, reason: result.reason ?? "操作被拒绝" },
    );

    if (result.ok) {
      broadcastSnapshot(result.state);
    }
  }

  function startGame() {
    if (!roomInfo) return;
    const names = [...DEFAULT_PLAYER_NAMES] as [string, string, string, string];
    const seatTypes: Partial<Record<Seat, SeatType>> = { 0: "human", 1: "bot", 2: "bot", 3: "bot" };
    names[0] = nickname.trim() || "房主";

    for (const guest of guests) {
      names[guest.seat] = guest.nickname;
      seatTypes[guest.seat] = "remote";
    }

    const next = createNewGame(Date.now(), undefined, 1, names, seatTypes);
    next.roomId = roomInfo.roomCode;
    setHostState(next);
    setStatus("playing");
    window.setTimeout(() => broadcastSnapshot(next), 0);
  }

  async function copyRoomCode() {
    if (!roomInfo) return;
    await navigator.clipboard?.writeText(roomInfo.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (status === "playing" && roomInfo && hostState) {
    return (
      <App
        online={{
          role: "host",
          roomCode: roomInfo.roomCode,
          seat: 0,
          connectionState: "host",
          state: hostState,
          incomingAction,
          onHostStateChange: (state) => {
            setHostState(state);
            broadcastSnapshot(state);
          },
          onHostActionResult: handleHostActionResult,
          onLeaveRoom: onBackMode,
        }}
      />
    );
  }

  return (
    <main className="home-shell" aria-label="创建巷口麻将朋友房间">
      <section className="home-frame room-frame">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackMode} aria-label="返回开桌方式">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">巷口麻将 · 朋友房间</p>
            <h1>创建房间</h1>
            <p className="home-sub">房主浏览器负责规则和同步，空座开始后自动用机器人补齐。</p>
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
              {([0, 1, 2, 3] as Seat[]).map((seat) => {
                const guest = guests.find((item) => item.seat === seat);
                const label = seat === 0 ? nickname.trim() || "房主" : guest?.nickname ?? "机器人补位";
                return (
                  <div className="room-seat" key={seat}>
                    <span>{seat === 0 ? "本家" : `${seat + 1} 号位`}</span>
                    <strong>{label}</strong>
                    <em>{seat === 0 ? "房主" : guest ? (guest.connected ? "已连接" : "信令中") : "空位"}</em>
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

export function XiangkouJoinRoom({
  initialRoomCode,
  onBackMode,
}: {
  initialRoomCode?: string;
  onBackMode: () => void;
}) {
  const [roomCode, setRoomCode] = useState(() => normalizeRoomCode(initialRoomCode ?? ""));
  const [nickname, setNickname] = useState(() => localStorage.getItem("xiangkou-online-nickname") ?? "玩家");
  const [joined, setJoined] = useState<RoomInfo>();
  const [tableState, setTableState] = useState<GameState>();
  const [status, setStatus] = useState<"idle" | "joining" | "waiting" | "playing" | "error">("idle");
  const [connectionState, setConnectionState] = useState<OnlineConnectionState>("reconnecting");
  const [error, setError] = useState("");
  const peerRef = useRef<OnlinePeer>();
  const guestPeerId = joined?.peerId;
  const guestToken = joined?.guestToken;
  const seat = toSeat(joined?.seat, 1);

  useEffect(() => {
    return () => peerRef.current?.close();
  }, []);

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault();
    const code = normalizeRoomCode(roomCode);
    const name = nickname.trim() || "玩家";
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
      setConnectionState("reconnecting");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "加入房间失败");
    }
  }

  useEffect(() => {
    if (!joined || !guestPeerId || !guestToken) {
      return undefined;
    }

    const activeRoomCode = joined.roomCode;
    const activeGuestPeerId = guestPeerId;
    const activeGuestToken = guestToken;
    let stopped = false;

    async function pollSignals() {
      try {
        const signals = await client.getSignals(activeRoomCode, activeGuestPeerId);
        for (const signal of signals) {
          if (signal.type === "offer") {
            const peer = ensureGuestPeer(signal.peerId);
            await peer.peerConnection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            const answer = await peer.peerConnection.createAnswer();
            await peer.peerConnection.setLocalDescription(answer);
            await client.postAnswer(activeRoomCode, activeGuestToken, seat, answer, activeGuestPeerId, signal.peerId);
          }

          if (signal.type === "ice") {
            const peer = peerRef.current;
            if (peer) {
              await peer.peerConnection.addIceCandidate(signal.payload as RTCIceCandidateInit);
            }
          }
        }
      } catch {
        if (!stopped) {
          setConnectionState((current) => (current === "guest" ? "reconnecting" : current));
        }
      }
    }

    pollSignals();
    const timer = window.setInterval(pollSignals, 1200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [guestPeerId, guestToken, joined, seat]);

  function ensureGuestPeer(targetPeerId: string): OnlinePeer {
    if (peerRef.current) {
      return peerRef.current;
    }

    const peer = createGuestPeer({
      onChannelOpen: () => {
        setConnectionState("guest");
        setStatus((current) => (current === "waiting" ? "waiting" : current));
        peer.send({
          type: "hello",
          peerId: guestPeerId ?? createPeerId("guest"),
          nickname: nickname.trim() || "玩家",
          requestedSeat: seat,
        });
      },
      onChannelClose: () => setConnectionState("reconnecting"),
      onConnectionState: (state) => setConnectionState(onlineConnectionStateFromPeer(state)),
      onIceCandidate: (candidate) => {
        if (!joined || !guestToken || !guestPeerId) return;
        client.postIce(joined.roomCode, guestToken, guestPeerId, [candidate], targetPeerId).catch(() => {
          setError("ICE 信令写入失败");
        });
      },
      onMessage: handleGuestMessage,
    });

    peerRef.current = peer;
    return peer;
  }

  function handleGuestMessage(message: OnlineMessage) {
    if (message.type === "seatAssigned") {
      setJoined((current) => (current ? { ...current, seat: message.seat } : current));
      return;
    }

    if (shouldApplyStateSnapshot("guest", message)) {
      setTableState(message.state as GameState);
      setStatus("playing");
      return;
    }

    if (message.type === "actionRejected") {
      setError(message.reason);
    }
  }

  function sendPlayerAction(action: PlayerAction) {
    const ok = peerRef.current?.send({
      type: "playerAction",
      requestId: createRequestId(),
      action,
    });

    if (!ok) {
      setConnectionState("reconnecting");
      setError("连接尚未恢复，操作未发送");
    }
  }

  const roomTitle = useMemo(() => (roomCode ? `加入 ${roomCode}` : "加入房间"), [roomCode]);

  if (status === "playing" && joined && tableState) {
    return (
      <App
        online={{
          role: "guest",
          roomCode: joined.roomCode,
          seat,
          connectionState,
          state: tableState,
          onPlayerAction: sendPlayerAction,
          onLeaveRoom: onBackMode,
        }}
      />
    );
  }

  return (
    <main className="home-shell" aria-label="加入巷口麻将朋友房间">
      <section className="home-frame room-frame">
        <header className="home-header home-header--split">
          <button className="home-back" type="button" onClick={onBackMode} aria-label="返回开桌方式">
            <ArrowLeft size={18} />
            返回
          </button>
          <div>
            <p className="home-eyebrow">巷口麻将 · 朋友房间</p>
            <h1>{roomTitle}</h1>
            <p className="home-sub">输入房间号和昵称，连接成功后等待房主开始。</p>
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
              <em>{connectionState === "guest" ? "已连接房主" : "连接中"}</em>
            </div>
            <p className="room-waiting-text">你坐 {seat + 1} 号位。房主开始后会自动进入牌桌。</p>
            {error ? <p className="room-error">{error}</p> : null}
            <button className="room-secondary" type="button" onClick={() => peerRef.current?.send({ type: "syncRequest", seat })}>
              <RefreshCcw size={17} />
              请求同步
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

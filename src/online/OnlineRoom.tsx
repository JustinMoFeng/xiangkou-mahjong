import { ArrowLeft, Clipboard, Copy, Loader2, Play, RefreshCcw, Users } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { OnlineConnectionState, OnlineMessage } from "./protocol";
import { createRequestId, shouldApplyStateSnapshot } from "./protocol";
import { createPeerId, normalizeRoomCode, RoomSignalingClient, type RoomInfo } from "./signaling";
import { createGuestPeer, createHostPeer, type OnlinePeer } from "./webrtc";

export type SharedSeat = 0 | 1 | 2 | 3;

export type RoomGuest = {
  peerId: string;
  seat: SharedSeat;
  nickname: string;
  joinedAt: number;
  connected: boolean;
};

type HostPeerRecord = RoomGuest & {
  peer: OnlinePeer;
};

export type HostActionResult<TState> = {
  requestId: string;
  ok: boolean;
  reason?: string;
  state: TState;
};

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

type CreateRoomProps<TState, TAction> = {
  strings: OnlineRoomStrings;
  onBackMode: () => void;
  createInitialState: (input: { roomCode: string; hostName: string; guests: RoomGuest[] }) => TState;
  getStateTurn: (state: TState) => number;
  maskStateForSeat: (state: TState, seat: SharedSeat) => TState;
  renderHostTable: (props: {
    state: TState;
    roomCode: string;
    incomingAction?: { requestId: string; action: TAction };
    onHostStateChange: (state: TState) => void;
    onHostActionResult: (result: HostActionResult<TState>) => void;
    onLeaveRoom: () => void;
  }) => ReactNode;
};

type JoinRoomProps<TState, TAction> = {
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

const client = new RoomSignalingClient();

function toSeat(value: number | undefined, fallback: SharedSeat): SharedSeat {
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

function hasPendingHostSignalPeers(peers: Map<string, HostPeerRecord>): boolean {
  return Array.from(peers.values()).some((record) => !openChannel(record.peer));
}

export function OnlineCreateRoom<TState, TAction>({
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
  const [incomingAction, setIncomingAction] = useState<{ requestId: string; action: TAction }>();
  const [status, setStatus] = useState<"idle" | "creating" | "waiting" | "playing" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const peersRef = useRef<Map<string, HostPeerRecord>>(new Map());
  const hostStateRef = useRef<TState>();
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
    const name = nickname.trim() || strings.hostFallbackName;
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
      if (!hasPendingHostSignalPeers(peersRef.current)) {
        return;
      }

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
    setIncomingAction({ requestId: message.requestId, action: message.action as TAction });
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

  function sendSnapshotToPeer(peerId: string, state: TState | undefined) {
    const record = peersRef.current.get(peerId);
    if (!record || !state) return;
    record.peer.send({
      type: "stateSnapshot",
      roomCode: roomInfo?.roomCode ?? "",
      turn: getStateTurn(state),
      state: maskStateForSeat(state, record.seat) as never,
    });
  }

  function broadcastSnapshot(state: TState) {
    hostStateRef.current = state;
    for (const record of peersRef.current.values()) {
      sendSnapshotToPeer(record.peerId, state);
    }
  }

  function handleHostActionResult(result: HostActionResult<TState>) {
    const peerId = pendingActionPeerRef.current.get(result.requestId);
    pendingActionPeerRef.current.delete(result.requestId);
    const peer = peerId ? peersRef.current.get(peerId)?.peer : undefined;

    peer?.send(
      result.ok
        ? { type: "actionAccepted", requestId: result.requestId, turn: getStateTurn(result.state) }
        : { type: "actionRejected", requestId: result.requestId, reason: result.reason ?? "操作被拒绝" },
    );

    if (result.ok) {
      broadcastSnapshot(result.state);
    }
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
    window.setTimeout(() => broadcastSnapshot(next), 0);
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

export function OnlineJoinRoom<TState, TAction>({
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
      setConnectionState("reconnecting");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "加入房间失败");
    }
  }

  useEffect(() => {
    if (!joined || !guestPeerId || !guestToken || connectionState === "guest") {
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
  }, [connectionState, guestPeerId, guestToken, joined, seat]);

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
          nickname: nickname.trim() || strings.guestFallbackName,
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
      setTableState(message.state as TState);
      setStatus("playing");
      return;
    }

    if (message.type === "actionRejected") {
      setError(message.reason);
    }
  }

  function sendPlayerAction(action: TAction) {
    const ok = peerRef.current?.send({
      type: "playerAction",
      requestId: createRequestId(),
      action: action as never,
    });

    if (!ok) {
      setConnectionState("reconnecting");
      setError("连接尚未恢复，操作未发送");
    }
  }

  const roomTitle = roomCode ? `${strings.joinTitle} ${roomCode}` : strings.joinTitle;

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

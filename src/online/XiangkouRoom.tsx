import App from "../App";
import { createNewGame, DEFAULT_PLAYER_NAMES } from "../game/engine";
import type { GameState, Seat, SeatType } from "../game/types";
import { maskStateForSeat } from "./gameActions";
import { OnlineCreateRoom, OnlineJoinRoom, type RoomGuest } from "./OnlineRoom";
import type { PlayerAction } from "./protocol";

const STRINGS = {
  gameTitle: "巷口麻将",
  createTitle: "创建巷口麻将房间",
  joinTitle: "加入巷口麻将房间",
  createDescription: "生成 6 位房间号，房主浏览器负责规则和同步，空座自动机器人补位。",
  joinDescription: "输入房间号和昵称，加入后等待房主开始。",
  hostFallbackName: "房主",
  guestFallbackName: "玩家",
  botFillName: "机器人补位",
};

function createInitialState({ roomCode, hostName, guests }: { roomCode: string; hostName: string; guests: RoomGuest[] }): GameState {
  const names = [...DEFAULT_PLAYER_NAMES] as [string, string, string, string];
  const seatTypes: Partial<Record<Seat, SeatType>> = { 0: "human", 1: "bot", 2: "bot", 3: "bot" };
  names[0] = hostName;

  for (const guest of guests) {
    names[guest.seat] = guest.nickname;
    seatTypes[guest.seat] = "remote";
  }

  const state = createNewGame(Date.now(), undefined, 1, names, seatTypes);
  state.roomId = roomCode;
  return state;
}

export function XiangkouCreateRoom({ onBackMode }: { onBackMode: () => void }) {
  return (
    <OnlineCreateRoom<GameState, PlayerAction>
      strings={STRINGS}
      onBackMode={onBackMode}
      createInitialState={createInitialState}
      getStateTurn={(state) => state.turn}
      maskStateForSeat={(state, seat) => maskStateForSeat(state, seat)}
      renderHostTable={({ state, roomCode, incomingAction, onHostStateChange, onHostActionResult, onLeaveRoom }) => (
        <App
          online={{
            role: "host",
            roomCode,
            seat: 0,
            connectionState: "host",
            state,
            incomingAction,
            onHostStateChange,
            onHostActionResult,
            onLeaveRoom,
          }}
        />
      )}
    />
  );
}

export function XiangkouJoinRoom({ initialRoomCode, onBackMode }: { initialRoomCode?: string; onBackMode: () => void }) {
  return (
    <OnlineJoinRoom<GameState, PlayerAction>
      strings={STRINGS}
      initialRoomCode={initialRoomCode}
      onBackMode={onBackMode}
      renderGuestTable={({ state, roomCode, seat, connectionState, onPlayerAction, onLeaveRoom }) => (
        <App
          online={{
            role: "guest",
            roomCode,
            seat,
            connectionState,
            state,
            onPlayerAction,
            onLeaveRoom,
          }}
        />
      )}
    />
  );
}

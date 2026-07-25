import SichuanApp from "../sichuan/SichuanApp";
import { createNewGame } from "../sichuan/engine";
import type { GameState, Seat, SeatType } from "../sichuan/types";
import { OnlineCreateRoom, OnlineJoinRoom, type RoomGuest } from "./OnlineRoom";
import { maskSichuanStateForSeat, type SichuanPlayerAction } from "./sichuanActions";

const STRINGS = {
  gameTitle: "川麻",
  createTitle: "创建川麻房间",
  joinTitle: "加入川麻房间",
  createDescription: "生成 6 位房间号，好友加入后由房主开始血战，空座自动机器人补位。",
  joinDescription: "输入房间号和昵称，连接成功后等待房主开始。",
  hostFallbackName: "房主",
  guestFallbackName: "玩家",
  botFillName: "机器人补位",
};

function createInitialState({ roomCode, hostName, guests }: { roomCode: string; hostName: string; guests: RoomGuest[] }): GameState {
  const names = ["房主", "下家阿蜀", "对家幺鸡", "上家老川"] as [string, string, string, string];
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

export function SichuanCreateRoom({ onBackMode }: { onBackMode: () => void }) {
  return (
    <OnlineCreateRoom<GameState, SichuanPlayerAction>
      strings={STRINGS}
      onBackMode={onBackMode}
      createInitialState={createInitialState}
      getStateTurn={(state) => state.turn}
      maskStateForSeat={(state, seat) => maskSichuanStateForSeat(state, seat)}
      renderHostTable={({ state, roomCode, incomingAction, onHostStateChange, onHostActionResult, onLeaveRoom }) => (
        <SichuanApp
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

export function SichuanJoinRoom({ initialRoomCode, onBackMode }: { initialRoomCode?: string; onBackMode: () => void }) {
  return (
    <OnlineJoinRoom<GameState, SichuanPlayerAction>
      strings={STRINGS}
      initialRoomCode={initialRoomCode}
      onBackMode={onBackMode}
      renderGuestTable={({ state, roomCode, seat, connectionState, onPlayerAction, onLeaveRoom }) => (
        <SichuanApp
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

import App from "../App";
import type { GameState } from "../game/types";
import { CloudRoom } from "./CloudRoom";
import type { PlayerAction } from "./protocol";

const STRINGS = {
  eyebrow: "巷口麻将 · 云端房间",
  createTitle: "创建云端房间",
  joinTitlePrefix: "云端房间",
  createDescription: "服务器负责发牌和规则，好友加入后由房主开始，空座自动机器人补位。",
  joinDescription: "输入房间号和昵称，连接后等待房主开始，掉线可自动重连。",
  hostFallbackName: "房主",
  guestFallbackName: "玩家",
};

export function XiangkouCloudCreateRoom({ onBackMode }: { onBackMode: () => void }) {
  return (
    <CloudRoom<GameState, PlayerAction>
      kind="xiangkou"
      mode="create"
      onBackMode={onBackMode}
      strings={STRINGS}
      renderTable={({ state, roomCode, seat, connectionState, onPlayerAction, onLeaveRoom }) => (
        <App
          online={{ role: "guest", roomCode, seat, connectionState, state, onPlayerAction, onLeaveRoom }}
        />
      )}
    />
  );
}

export function XiangkouCloudJoinRoom({
  initialRoomCode,
  onBackMode,
}: {
  initialRoomCode?: string;
  onBackMode: () => void;
}) {
  return (
    <CloudRoom<GameState, PlayerAction>
      kind="xiangkou"
      mode="join"
      initialRoomCode={initialRoomCode}
      onBackMode={onBackMode}
      strings={STRINGS}
      renderTable={({ state, roomCode, seat, connectionState, onPlayerAction, onLeaveRoom }) => (
        <App
          online={{ role: "guest", roomCode, seat, connectionState, state, onPlayerAction, onLeaveRoom }}
        />
      )}
    />
  );
}

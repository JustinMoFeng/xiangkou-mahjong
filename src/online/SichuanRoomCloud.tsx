import SichuanApp from "../sichuan/SichuanApp";
import type { GameState } from "../sichuan/types";
import { CloudRoom } from "./CloudRoom";
import type { SichuanPlayerAction } from "./sichuanActions";

const STRINGS = {
  eyebrow: "川麻 · 云端房间",
  createTitle: "创建川麻云端房间",
  joinTitlePrefix: "川麻云端房间",
  createDescription: "服务器负责发牌、定缺和血战规则，好友加入后由房主开始，空座自动机器人补位。",
  joinDescription: "输入房间号和昵称，连接后等待房主开始，掉线可自动重连。",
  hostFallbackName: "房主",
  guestFallbackName: "玩家",
};

export function SichuanCloudCreateRoom({ onBackMode }: { onBackMode: () => void }) {
  return (
    <CloudRoom<GameState, SichuanPlayerAction>
      kind="sichuan"
      mode="create"
      onBackMode={onBackMode}
      strings={STRINGS}
      renderTable={({ state, roomCode, seat, connectionState, onPlayerAction, onLeaveRoom }) => (
        <SichuanApp
          online={{ role: "guest", roomCode, seat, connectionState, state, onPlayerAction, onLeaveRoom }}
        />
      )}
    />
  );
}

export function SichuanCloudJoinRoom({
  initialRoomCode,
  onBackMode,
}: {
  initialRoomCode?: string;
  onBackMode: () => void;
}) {
  return (
    <CloudRoom<GameState, SichuanPlayerAction>
      kind="sichuan"
      mode="join"
      initialRoomCode={initialRoomCode}
      onBackMode={onBackMode}
      strings={STRINGS}
      renderTable={({ state, roomCode, seat, connectionState, onPlayerAction, onLeaveRoom }) => (
        <SichuanApp
          online={{ role: "guest", roomCode, seat, connectionState, state, onPlayerAction, onLeaveRoom }}
        />
      )}
    />
  );
}

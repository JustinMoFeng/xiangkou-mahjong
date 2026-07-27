import type { GameState, Seat, TileCode } from "../game/types";
import type { GameState as SichuanGameState } from "../sichuan/types";
import type { SichuanPlayerAction } from "./sichuanActions";

export type OnlineRole = "host" | "guest";
export type OnlineConnectionState = "host" | "guest" | "reconnecting" | "disconnected";

export type PlayerAction =
  | {
      type: "discard";
      seat: Seat;
      tileId: string;
    }
  | {
      type: "claimWin";
      seat: Seat;
    }
  | {
      type: "claimMeld";
      seat: Seat;
      optionId: string;
    }
  | {
      type: "passClaim";
      seat: Seat;
    }
  | {
      type: "selfDraw";
      seat: Seat;
    }
  | {
      type: "kong";
      seat: Seat;
      code: TileCode;
    }
  | {
      type: "arrangeHand";
      seat: Seat;
    };

export type OnlineMessage =
  | {
      type: "hello";
      peerId: string;
      nickname: string;
      requestedSeat?: Seat;
    }
  | {
      type: "seatAssigned";
      peerId: string;
      seat: Seat;
      nickname: string;
    }
  | {
      type: "stateSnapshot";
      state: GameState | SichuanGameState;
      roomCode: string;
      turn: number;
      revision?: number;
    }
  | {
      type: "playerAction";
      requestId: string;
      action: PlayerAction | SichuanPlayerAction;
    }
  | {
      type: "actionAccepted";
      requestId: string;
      turn: number;
    }
  | {
      type: "actionRejected";
      requestId: string;
      reason: string;
    }
  | {
      type: "heartbeat";
      sentAt: number;
    }
  | {
      type: "syncRequest";
      seat: Seat;
    };

export function createRequestId(prefix = "act"): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}

export function encodeOnlineMessage(message: OnlineMessage): string {
  return JSON.stringify(message);
}

export function decodeOnlineMessage(input: string): OnlineMessage | undefined {
  try {
    const value = JSON.parse(input) as Partial<OnlineMessage> | undefined;
    return typeof value?.type === "string" ? (value as OnlineMessage) : undefined;
  } catch {
    return undefined;
  }
}

export function shouldApplyStateSnapshot(
  role: OnlineRole,
  message: OnlineMessage,
): message is Extract<OnlineMessage, { type: "stateSnapshot" }> {
  return role === "guest" && message.type === "stateSnapshot";
}

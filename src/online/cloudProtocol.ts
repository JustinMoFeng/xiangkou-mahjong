import type { GameState, Seat } from "../game/types";
import type { GameState as SichuanGameState } from "../sichuan/types";
import type { PlayerAction } from "./protocol";
import type { SichuanPlayerAction } from "./sichuanActions";

/**
 * Wire protocol for the Cloudflare (server-authoritative) online path.
 *
 * A room lives inside a single `GameRoom` Durable Object. Every player holds
 * one WebSocket to that DO. The DO runs the authoritative engine, so clients
 * only ever *send actions* and *receive masked snapshots* — there is no "host"
 * browser and no peer-to-peer connection.
 *
 * This module is imported by both the browser client and the Worker/DO, so it
 * must stay free of any browser- or worker-only APIs.
 */

export type LobbySeat = {
  seat: Seat;
  nickname: string;
  connected: boolean;
  isBot: boolean;
};

/** Messages a client sends to the room. */
export type ClientMessage =
  | {
      type: "join";
      /** Stable id persisted client-side so a reconnect reclaims its seat. */
      clientId: string;
      nickname: string;
    }
  | {
      type: "start";
    }
  | {
      type: "action";
      requestId: string;
      action: PlayerAction | SichuanPlayerAction;
    }
  | {
      type: "sync";
    };

/** Messages the room sends to a client. */
export type ServerMessage =
  | {
      type: "welcome";
      seat: Seat;
      isHost: boolean;
      roomCode: string;
      status: RoomStatus;
      seats: LobbySeat[];
    }
  | {
      type: "lobby";
      status: RoomStatus;
      seats: LobbySeat[];
    }
  | {
      type: "snapshot";
      turn: number;
      state: GameState | SichuanGameState;
    }
  | {
      type: "actionRejected";
      requestId: string;
      reason: string;
    }
  | {
      type: "error";
      reason: string;
    };

export type RoomStatus = "waiting" | "playing";

export function encodeClientMessage(message: ClientMessage): string {
  return JSON.stringify(message);
}

export function decodeClientMessage(input: string): ClientMessage | undefined {
  return decode<ClientMessage>(input);
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

export function decodeServerMessage(input: string): ServerMessage | undefined {
  return decode<ServerMessage>(input);
}

function decode<T extends { type: string }>(input: string): T | undefined {
  try {
    const value = JSON.parse(input) as Partial<T> | undefined;
    return typeof value?.type === "string" ? (value as T) : undefined;
  } catch {
    return undefined;
  }
}

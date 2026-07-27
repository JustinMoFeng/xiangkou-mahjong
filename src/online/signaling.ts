import type { OnlineMessage } from "./protocol";

export type RoomInfo = {
  roomCode: string;
  hostToken?: string;
  guestToken?: string;
  peerId?: string;
  hostPeerId?: string;
  seat?: number;
  guestCount?: number;
  guests?: Array<{
    peerId: string;
    seat: number;
    nickname: string;
    joinedAt: number;
  }>;
  status?: "waiting" | "playing" | "expired";
  expiresAt: number;
};

export type RoomEventEnvelope = {
  id: string;
  roomCode: string;
  peerId: string;
  targetPeerId: string;
  message: OnlineMessage;
  createdAt: number;
};

export class RelayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

export class RoomRelayClient {
  constructor(private readonly baseUrl = "/api/rooms") {}

  async createRoom(nickname: string): Promise<RoomInfo> {
    return this.request<RoomInfo>("", {
      method: "POST",
      body: JSON.stringify({ nickname }),
    });
  }

  async getRoom(roomCode: string): Promise<RoomInfo> {
    return this.request<RoomInfo>(`/${normalizeRoomCode(roomCode)}`);
  }

  async joinRoom(roomCode: string, nickname: string): Promise<RoomInfo> {
    return this.request<RoomInfo>(`/${normalizeRoomCode(roomCode)}`, {
      method: "POST",
      body: JSON.stringify({ nickname }),
    });
  }

  async postEvent(
    roomCode: string,
    token: string,
    peerId: string,
    targetPeerId: string,
    message: OnlineMessage,
  ): Promise<void> {
    await this.request(`/${normalizeRoomCode(roomCode)}/events`, {
      method: "POST",
      body: JSON.stringify({ token, peerId, targetPeerId, message }),
    });
  }

  async getEvents(roomCode: string, peerId: string): Promise<Array<RoomEventEnvelope>> {
    const params = new URLSearchParams({ peerId });
    return this.request<Array<RoomEventEnvelope>>(`/${normalizeRoomCode(roomCode)}/events?${params.toString()}`);
  }

  private async request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as { error?: string } & T) : (undefined as T);

    if (!response.ok) {
      throw new RelayError((payload as { error?: string } | undefined)?.error ?? "房间同步请求失败", response.status);
    }

    return payload as T;
  }
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}


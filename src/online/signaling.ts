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

export type SignalPayload = RTCSessionDescriptionInit | RTCIceCandidateInit;

export type SignalEnvelope<T = SignalPayload> = {
  id: string;
  roomCode: string;
  peerId: string;
  targetPeerId?: string;
  type: "offer" | "answer" | "ice";
  payload: T;
  createdAt: number;
};

export class SignalingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SignalingError";
  }
}

export class RoomSignalingClient {
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

  async postOffer(
    roomCode: string,
    hostToken: string,
    offer: RTCSessionDescriptionInit,
    peerId: string,
    targetPeerId: string,
  ): Promise<void> {
    await this.request(`/${normalizeRoomCode(roomCode)}/offer`, {
      method: "POST",
      body: JSON.stringify({ hostToken, offer, peerId, targetPeerId }),
    });
  }

  async postAnswer(
    roomCode: string,
    guestToken: string,
    seat: number,
    answer: RTCSessionDescriptionInit,
    peerId: string,
    targetPeerId: string,
  ): Promise<void> {
    await this.request(`/${normalizeRoomCode(roomCode)}/answer`, {
      method: "POST",
      body: JSON.stringify({ guestToken, seat, answer, peerId, targetPeerId }),
    });
  }

  async postIce(
    roomCode: string,
    token: string,
    peerId: string,
    candidates: RTCIceCandidateInit[],
    targetPeerId?: string,
  ): Promise<void> {
    await this.request(`/${normalizeRoomCode(roomCode)}/ice`, {
      method: "POST",
      body: JSON.stringify({ token, peerId, candidates, targetPeerId }),
    });
  }

  async getSignals(roomCode: string, peerId: string): Promise<Array<SignalEnvelope>> {
    const params = new URLSearchParams({ peerId });
    return this.request<Array<SignalEnvelope>>(`/${normalizeRoomCode(roomCode)}/signals?${params.toString()}`);
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
      throw new SignalingError((payload as { error?: string } | undefined)?.error ?? "房间信令请求失败", response.status);
    }

    return payload as T;
  }
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function createPeerId(prefix = "peer"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

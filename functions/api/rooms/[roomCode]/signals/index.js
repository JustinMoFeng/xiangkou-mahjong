import { drainSignals, getKv, getRoomOr404, json, normalizeRoomCode } from "../../_shared.js";

export async function onRequestGet({ request, env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = normalizeRoomCode(params?.roomCode);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;

    const url = new URL(request.url);
    const peerId = url.searchParams.get("peerId");
    if (!peerId) {
      return json({ error: "缺少 peerId" }, { status: 400 });
    }

    const knownPeer =
      peerId === room.hostPeerId || room.guests.some((guest) => guest.peerId === peerId);
    if (!knownPeer) {
      return json({ error: "未知 peerId" }, { status: 403 });
    }

    return json(await drainSignals(kv, roomCode, peerId));
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "读取信令失败" }, { status: 500 });
  }
}

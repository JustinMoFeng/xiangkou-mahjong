import {
  createToken,
  getKv,
  getRoomOr404,
  json,
  kvPutJson,
  normalizeRoomCode,
  now,
  readJson,
  roomKey,
  roomPublicInfo,
} from "../_shared.js";

function roomCodeFromContext(params) {
  return normalizeRoomCode(params?.roomCode);
}

export async function onRequestGet({ env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = roomCodeFromContext(params);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;
    return json(roomPublicInfo(room));
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "查询房间失败" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = roomCodeFromContext(params);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;

    if (room.status !== "waiting") {
      return json({ error: "房间已经开始" }, { status: 409 });
    }

    if (room.guests.length >= 3) {
      return json({ error: "房间已满" }, { status: 409 });
    }

    const body = await readJson(request);
    const occupied = new Set(room.guests.map((guest) => guest.seat));
    const seat = [1, 2, 3].find((candidate) => !occupied.has(candidate));

    if (!seat) {
      return json({ error: "房间已满" }, { status: 409 });
    }

    const guest = {
      peerId: createToken("guestPeer"),
      guestToken: createToken("guest"),
      nickname: String(body.nickname ?? "玩家").trim().slice(0, 16) || "玩家",
      seat,
      joinedAt: now(),
    };

    room.guests.push(guest);
    room.expiresAt = now() + 30 * 60 * 1000;
    await kvPutJson(kv, roomKey(roomCode), room, 30 * 60);

    return json({
      ...roomPublicInfo(room),
      guestToken: guest.guestToken,
      peerId: guest.peerId,
      seat: guest.seat,
    });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "加入房间失败" }, { status: 500 });
  }
}

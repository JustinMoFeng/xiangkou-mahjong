import {
  createRoomCode,
  createToken,
  getKv,
  json,
  kvGetJson,
  kvPutJson,
  now,
  readJson,
  roomKey,
  roomPublicInfo,
} from "./_shared.js";

export async function onRequestPost({ request, env }) {
  try {
    const kv = getKv(env);
    const body = await readJson(request);
    let roomCode = createRoomCode();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!(await kvGetJson(kv, roomKey(roomCode)))) break;
      roomCode = createRoomCode();
    }

    const expiresAt = now() + 10 * 60 * 1000;
    const room = {
      roomCode,
      hostToken: createToken("host"),
      hostPeerId: createToken("hostPeer"),
      hostNickname: String(body.nickname ?? "房主").trim().slice(0, 16) || "房主",
      guests: [],
      status: "waiting",
      createdAt: now(),
      expiresAt,
    };

    await kvPutJson(kv, roomKey(roomCode), room);
    return json({
      ...roomPublicInfo(room),
      hostToken: room.hostToken,
      peerId: room.hostPeerId,
    });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "创建房间失败" }, { status: 500 });
  }
}

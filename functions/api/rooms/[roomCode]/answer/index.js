import { appendSignal, getKv, getRoomOr404, json, normalizeRoomCode, readJson } from "../../_shared.js";

export async function onRequestPost({ request, env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = normalizeRoomCode(params?.roomCode);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;

    const body = await readJson(request);
    const guest = room.guests.find((item) => item.guestToken === body.guestToken && item.seat === body.seat);
    if (!guest) {
      return json({ error: "加入者令牌无效" }, { status: 403 });
    }

    if (!body.answer || !body.peerId || !body.targetPeerId) {
      return json({ error: "缺少 answer 信令字段" }, { status: 400 });
    }

    await appendSignal(kv, roomCode, body.targetPeerId, {
      type: "answer",
      peerId: body.peerId,
      targetPeerId: body.targetPeerId,
      payload: body.answer,
    });

    return json({ ok: true });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "写入 answer 失败" }, { status: 500 });
  }
}

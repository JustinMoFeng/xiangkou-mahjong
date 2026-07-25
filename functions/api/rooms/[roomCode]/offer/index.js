import { appendSignal, getKv, getRoomOr404, json, normalizeRoomCode, readJson } from "../../_shared.js";

export async function onRequestPost({ request, env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = normalizeRoomCode(params?.roomCode);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;

    const body = await readJson(request);
    if (body.hostToken !== room.hostToken) {
      return json({ error: "房主令牌无效" }, { status: 403 });
    }

    if (!body.offer || !body.peerId || !body.targetPeerId) {
      return json({ error: "缺少 offer 信令字段" }, { status: 400 });
    }

    await appendSignal(kv, roomCode, body.targetPeerId, {
      type: "offer",
      peerId: body.peerId,
      targetPeerId: body.targetPeerId,
      payload: body.offer,
    });

    return json({ ok: true });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "写入 offer 失败" }, { status: 500 });
  }
}

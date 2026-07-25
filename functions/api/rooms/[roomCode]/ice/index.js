import { appendSignal, canUseToken, getKv, getRoomOr404, json, normalizeRoomCode, readJson } from "../../_shared.js";

export async function onRequestPost({ request, env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = normalizeRoomCode(params?.roomCode);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;

    const body = await readJson(request);
    if (!canUseToken(room, body.token)) {
      return json({ error: "令牌无效" }, { status: 403 });
    }

    if (!body.peerId || !Array.isArray(body.candidates)) {
      return json({ error: "缺少 ICE 信令字段" }, { status: 400 });
    }

    const targetPeerId = body.targetPeerId || (body.peerId === room.hostPeerId ? undefined : room.hostPeerId);
    if (!targetPeerId) {
      return json({ error: "缺少目标 peerId" }, { status: 400 });
    }

    for (const candidate of body.candidates) {
      await appendSignal(kv, roomCode, targetPeerId, {
        type: "ice",
        peerId: body.peerId,
        targetPeerId,
        payload: candidate,
      });
    }

    return json({ ok: true });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "写入 ICE 失败" }, { status: 500 });
  }
}

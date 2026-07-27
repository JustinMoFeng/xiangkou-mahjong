import {
  appendEvent,
  drainEvents,
  getKv,
  getRoomOr404,
  isKnownPeer,
  json,
  normalizeRoomCode,
  peerForToken,
  readJson,
} from "../../_shared.js";

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
    if (!isKnownPeer(room, peerId)) {
      return json({ error: "未知 peerId" }, { status: 403 });
    }

    return json(await drainEvents(kv, roomCode, peerId));
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "读取事件失败" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env, params }) {
  try {
    const kv = getKv(env);
    const roomCode = normalizeRoomCode(params?.roomCode);
    const [room, error] = await getRoomOr404(kv, roomCode);
    if (error) return error;

    const body = await readJson(request);
    const peerId = String(body.peerId ?? "");
    const targetPeerId = String(body.targetPeerId ?? "");
    const authorizedPeerId = peerForToken(room, body.token);

    if (!authorizedPeerId || authorizedPeerId !== peerId) {
      return json({ error: "令牌无效" }, { status: 403 });
    }
    if (!targetPeerId || !isKnownPeer(room, targetPeerId)) {
      return json({ error: "目标 peerId 无效" }, { status: 400 });
    }
    if (!body.message || typeof body.message.type !== "string") {
      return json({ error: "事件消息无效" }, { status: 400 });
    }

    await appendEvent(kv, roomCode, targetPeerId, {
      peerId,
      targetPeerId,
      message: body.message,
    });

    return json({ ok: true });
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "写入事件失败" }, { status: 500 });
  }
}

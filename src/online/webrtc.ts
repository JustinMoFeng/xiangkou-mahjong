import { decodeOnlineMessage, encodeOnlineMessage, type OnlineMessage } from "./protocol";

export type OnlinePeerEvents = {
  onMessage?: (message: OnlineMessage) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
};

export type OnlinePeer = {
  peerConnection: RTCPeerConnection;
  channel?: RTCDataChannel;
  send: (message: OnlineMessage) => boolean;
  close: () => void;
};

const DEFAULT_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function createHostPeer(events: OnlinePeerEvents = {}, config: RTCConfiguration = DEFAULT_CONFIG): OnlinePeer {
  const peerConnection = new RTCPeerConnection(config);
  const channel = peerConnection.createDataChannel("xiangkou-game", { ordered: true });
  wirePeerConnection(peerConnection, events);
  wireDataChannel(channel, events);
  return createPeerHandle(peerConnection, channel);
}

export function createGuestPeer(events: OnlinePeerEvents = {}, config: RTCConfiguration = DEFAULT_CONFIG): OnlinePeer {
  const peerConnection = new RTCPeerConnection(config);
  const handle = createPeerHandle(peerConnection);
  peerConnection.ondatachannel = (event) => {
    handle.channel = event.channel;
    wireDataChannel(event.channel, events);
  };
  wirePeerConnection(peerConnection, events);
  return handle;
}

function createPeerHandle(peerConnection: RTCPeerConnection, channel?: RTCDataChannel): OnlinePeer {
  return {
    peerConnection,
    channel,
    send(message) {
      const activeChannel = this.channel;
      if (!activeChannel || activeChannel.readyState !== "open") {
        return false;
      }
      activeChannel.send(encodeOnlineMessage(message));
      return true;
    },
    close() {
      this.channel?.close();
      peerConnection.close();
    },
  };
}

function wirePeerConnection(peerConnection: RTCPeerConnection, events: OnlinePeerEvents): void {
  peerConnection.onconnectionstatechange = () => events.onConnectionState?.(peerConnection.connectionState);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      events.onIceCandidate?.(event.candidate.toJSON());
    }
  };
}

function wireDataChannel(channel: RTCDataChannel, events: OnlinePeerEvents): void {
  channel.onopen = () => events.onChannelOpen?.();
  channel.onclose = () => events.onChannelClose?.();
  channel.onmessage = (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    const message = decodeOnlineMessage(event.data);
    if (message) {
      events.onMessage?.(message);
    }
  };
}

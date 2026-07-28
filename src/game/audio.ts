import type { GameState, MeldKind, Tile } from "./types";

export type AudioEvent =
  | { kind: "discard"; tile: Tile }
  | { kind: "meld"; action: MeldKind }
  | { kind: "win" };

const NUMBER_WORDS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const BGM_PATH = `${import.meta.env.BASE_URL}audio/mahjong-bgm.mp3`;

export function getAudioEvents(previous: GameState | undefined, current: GameState): AudioEvent[] {
  const events: AudioEvent[] = [];

  if (!previous) {
    return events;
  }

  if (current.winner && !previous.winner) {
    events.push({ kind: "win" });
    return events;
  }

  if (
    current.lastDiscard &&
    (!previous.lastDiscard ||
      previous.lastDiscard.tile.id !== current.lastDiscard.tile.id ||
      previous.lastDiscard.seat !== current.lastDiscard.seat)
  ) {
    events.push({ kind: "discard", tile: current.lastDiscard.tile });
  }

  const previousMeldCount = previous.players.reduce((count, player) => count + player.melds.length, 0);
  const currentMeldCount = current.players.reduce((count, player) => count + player.melds.length, 0);
  if (currentMeldCount > previousMeldCount) {
    const player = current.players.find((item, index) => item.melds.length > previous.players[index].melds.length);
    const meld = player?.melds[player.melds.length - 1];
    if (meld) {
      events.push({ kind: "meld", action: meld.kind });
    }
  } else {
    const upgradedMeld = current.players
      .flatMap((player, playerIndex) =>
        player.melds.map((meld, meldIndex) => ({
          meld,
          previousMeld: previous.players[playerIndex]?.melds[meldIndex],
        })),
      )
      .find(({ meld, previousMeld }) => previousMeld && previousMeld.kind !== meld.kind);

    if (upgradedMeld) {
      events.push({ kind: "meld", action: upgradedMeld.meld.kind });
    }
  }

  return events;
}

export function tileVoiceText(tile: Tile): string {
  if (typeof tile.rank === "number") {
    const number = NUMBER_WORDS[tile.rank] ?? String(tile.rank);
    if (/^m[1-9]$/.test(tile.code)) return `${number}万`;
    if (/^p[1-9]$/.test(tile.code)) return `${number}筒`;
    if (/^s[1-9]$/.test(tile.code)) return `${number}条`;
  }

  return tile.label;
}

export class MahjongAudio {
  private context?: AudioContext;
  private enabled = false;
  private voice?: SpeechSynthesisVoice;
  private musicElement?: HTMLAudioElement;

  async enable() {
    this.enabled = true;
    const AudioContextConstructor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextConstructor && !this.context) {
      this.context = new AudioContextConstructor();
    }
    const context = this.context;
    if (context?.state === "suspended") {
      await context.resume();
    }
    this.voice = this.pickChineseVoice();
    this.startMusic();
  }

  disable() {
    this.enabled = false;
    window.speechSynthesis?.cancel();
    this.stopMusic();
  }

  isEnabled() {
    return this.enabled;
  }

  playEvents(events: AudioEvent[]) {
    if (!this.enabled || events.length === 0) {
      return;
    }

    for (const event of events) {
      if (event.kind === "discard") {
        this.speak(tileVoiceText(event.tile));
      } else if (event.kind === "meld") {
        this.playMeld(event.action);
        this.speak(meldVoiceText(event.action));
      } else {
        this.playWin();
        this.speak("胡");
      }
    }
  }

  private pickChineseVoice() {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    return (
      voices.find((voice) => voice.lang.toLowerCase().startsWith("zh") && voice.name.includes("Ting")) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith("yue"))
    );
  }

  private speak(text: string) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.08;
    utterance.pitch = 1.02;
    utterance.volume = 0.92;
    if (this.voice) {
      utterance.voice = this.voice;
    }
    window.speechSynthesis.speak(utterance);
  }

  private playMeld(action: MeldKind) {
    const base = action === "kong" ? 210 : action === "chow" ? 360 : 300;
    this.playTone([
      { frequency: base, duration: 0.08, gain: 0.2, type: "sawtooth" },
      { frequency: base * 1.5, duration: 0.08, gain: 0.14, type: "triangle", delay: 0.055 },
    ]);
  }

  private playWin() {
    this.playTone([
      { frequency: 440, duration: 0.1, gain: 0.2, type: "triangle" },
      { frequency: 660, duration: 0.12, gain: 0.2, type: "triangle", delay: 0.08 },
      { frequency: 880, duration: 0.18, gain: 0.18, type: "triangle", delay: 0.17 },
    ]);
  }

  private startMusic() {
    this.stopMusic();

    const music = new Audio(BGM_PATH);
    music.loop = true;
    music.volume = 0.26;
    this.musicElement = music;
    music.play().catch(() => {
      this.musicElement = undefined;
    });
  }

  private stopMusic() {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.currentTime = 0;
      this.musicElement = undefined;
    }
  }

  private playTone(notes: ToneNote[]) {
    const context = this.context;
    if (!context || !this.enabled) {
      return;
    }

    const now = context.currentTime;
    for (const note of notes) {
      const start = now + (note.delay ?? 0);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.02);
    }
  }
}

type ToneNote = {
  frequency: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  delay?: number;
};

function meldVoiceText(action: MeldKind) {
  if (action === "chow") return "吃";
  if (action === "kong") return "杠";
  return "碰";
}

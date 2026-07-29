export type CasualAudioGame = "link-match" | "yangyang" | "parking";

export type CasualAudioEvent =
  | "level-start"
  | "restart"
  | "select"
  | "match"
  | "clear"
  | "hint"
  | "shuffle"
  | "undo"
  | "blocked"
  | "fail"
  | "win";

type Track = {
  path: string;
  title: string;
};

export type CasualAudioSettings = {
  bgmVolume: number;
  sfxVolume: number;
};

const AUDIO_BASE = `${import.meta.env.BASE_URL}audio/casual`;
const SETTINGS_KEY = "mahjong-casual-audio-settings-v1";

export const CASUAL_BGM_TRACKS: Track[] = [
  { path: `${AUDIO_BASE}/bgm/carefree.mp3`, title: "Carefree" },
  { path: `${AUDIO_BASE}/bgm/wallpaper.mp3`, title: "Wallpaper" },
  { path: `${AUDIO_BASE}/bgm/local-forecast-elevator.mp3`, title: "Local Forecast - Elevator" },
  { path: `${AUDIO_BASE}/bgm/lobby-time.mp3`, title: "Lobby Time" },
  { path: `${AUDIO_BASE}/bgm/amazing-plan.mp3`, title: "Amazing Plan" },
  { path: `${AUDIO_BASE}/bgm/bossa-antigua.mp3`, title: "Bossa Antigua" },
];

const SFX_PATHS: Record<CasualAudioGame, Partial<Record<CasualAudioEvent, string>>> = {
  "link-match": {
    "level-start": `${AUDIO_BASE}/sfx/link-start.mp3`,
    restart: `${AUDIO_BASE}/sfx/link-restart.mp3`,
    select: `${AUDIO_BASE}/sfx/link-select.mp3`,
    match: `${AUDIO_BASE}/sfx/link-match.mp3`,
    hint: `${AUDIO_BASE}/sfx/link-hint.mp3`,
    shuffle: `${AUDIO_BASE}/sfx/link-shuffle.mp3`,
    win: `${AUDIO_BASE}/sfx/link-win.mp3`,
  },
  yangyang: {
    "level-start": `${AUDIO_BASE}/sfx/yang-start.mp3`,
    restart: `${AUDIO_BASE}/sfx/yang-restart.mp3`,
    select: `${AUDIO_BASE}/sfx/yang-select.mp3`,
    match: `${AUDIO_BASE}/sfx/yang-match.mp3`,
    hint: `${AUDIO_BASE}/sfx/yang-hint.mp3`,
    shuffle: `${AUDIO_BASE}/sfx/yang-shuffle.mp3`,
    undo: `${AUDIO_BASE}/sfx/yang-undo.mp3`,
    fail: `${AUDIO_BASE}/sfx/yang-fail.mp3`,
    win: `${AUDIO_BASE}/sfx/yang-win.mp3`,
  },
  parking: {
    "level-start": `${AUDIO_BASE}/sfx/parking-start.mp3`,
    restart: `${AUDIO_BASE}/sfx/parking-restart.mp3`,
    clear: `${AUDIO_BASE}/sfx/parking-clear.mp3`,
    blocked: `${AUDIO_BASE}/sfx/parking-blocked.mp3`,
    hint: `${AUDIO_BASE}/sfx/parking-hint.mp3`,
    win: `${AUDIO_BASE}/sfx/parking-win.mp3`,
  },
};

export const DEFAULT_CASUAL_AUDIO_SETTINGS: CasualAudioSettings = {
  bgmVolume: 0.18,
  sfxVolume: 0.56,
};

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

export function loadCasualAudioSettings(): CasualAudioSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_CASUAL_AUDIO_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<CasualAudioSettings>;
    return {
      bgmVolume: clampVolume(parsed.bgmVolume, DEFAULT_CASUAL_AUDIO_SETTINGS.bgmVolume),
      sfxVolume: clampVolume(parsed.sfxVolume, DEFAULT_CASUAL_AUDIO_SETTINGS.sfxVolume),
    };
  } catch {
    return DEFAULT_CASUAL_AUDIO_SETTINGS;
  }
}

export function saveCasualAudioSettings(settings: CasualAudioSettings): CasualAudioSettings {
  const next = {
    bgmVolume: clampVolume(settings.bgmVolume, DEFAULT_CASUAL_AUDIO_SETTINGS.bgmVolume),
    sfxVolume: clampVolume(settings.sfxVolume, DEFAULT_CASUAL_AUDIO_SETTINGS.sfxVolume),
  };

  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Audio settings are optional; the game should continue if storage is unavailable.
  }

  return next;
}

export class CasualGameAudio {
  private enabled = false;
  private bgmElement?: HTMLAudioElement;
  private currentTrackIndex = 0;
  private readonly sfxElements = new Map<CasualAudioEvent, HTMLAudioElement>();

  constructor(
    private readonly game: CasualAudioGame,
    private settings: CasualAudioSettings = loadCasualAudioSettings(),
  ) {
    this.currentTrackIndex = this.initialTrackIndex(game);
  }

  async enable() {
    this.enabled = true;
    this.preloadSfx();
    this.startBgm();
  }

  disable() {
    this.enabled = false;
    this.stopBgm();
    for (const sfx of this.sfxElements.values()) {
      sfx.pause();
      sfx.currentTime = 0;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  setSettings(settings: CasualAudioSettings) {
    this.settings = settings;

    if (this.bgmElement) {
      this.bgmElement.volume = this.settings.bgmVolume;
    }

    for (const sfx of this.sfxElements.values()) {
      sfx.volume = this.settings.sfxVolume;
    }
  }

  play(event: CasualAudioEvent) {
    if (!this.enabled) {
      return;
    }

    const path = SFX_PATHS[this.game][event];
    if (!path || this.settings.sfxVolume <= 0) {
      return;
    }

    const source = this.sfxElements.get(event) ?? this.createSfx(event, path);
    const sfx = source.paused ? source : source.cloneNode(true) as HTMLAudioElement;
    sfx.volume = this.settings.sfxVolume;
    sfx.currentTime = 0;
    sfx.play().catch(() => {
      // Browsers can reject overlapping or interrupted sounds; gameplay should continue silently.
    });
  }

  private startBgm() {
    this.stopBgm();
    if (!this.enabled || CASUAL_BGM_TRACKS.length === 0) {
      return;
    }

    const track = CASUAL_BGM_TRACKS[this.currentTrackIndex % CASUAL_BGM_TRACKS.length];
    const music = new Audio(track.path);
    music.volume = this.settings.bgmVolume;
    music.preload = "auto";
    music.addEventListener("ended", this.playNextBgmTrack);
    this.bgmElement = music;

    music.play().catch(() => {
      if (this.bgmElement === music) {
        this.bgmElement = undefined;
      }
    });
  }

  private stopBgm() {
    if (!this.bgmElement) {
      return;
    }

    this.bgmElement.removeEventListener("ended", this.playNextBgmTrack);
    this.bgmElement.pause();
    this.bgmElement.currentTime = 0;
    this.bgmElement = undefined;
  }

  private readonly playNextBgmTrack = () => {
    if (!this.enabled) {
      return;
    }

    this.currentTrackIndex = (this.currentTrackIndex + 1) % CASUAL_BGM_TRACKS.length;
    this.startBgm();
  };

  private preloadSfx() {
    for (const [event, path] of Object.entries(SFX_PATHS[this.game]) as Array<[CasualAudioEvent, string]>) {
      if (!this.sfxElements.has(event)) {
        this.createSfx(event, path);
      }
    }
  }

  private createSfx(event: CasualAudioEvent, path: string) {
    const audio = new Audio(path);
    audio.preload = "auto";
    audio.volume = this.settings.sfxVolume;
    this.sfxElements.set(event, audio);
    return audio;
  }

  private initialTrackIndex(game: CasualAudioGame) {
    if (game === "yangyang") return 2;
    if (game === "parking") return 4;
    return 0;
  }
}

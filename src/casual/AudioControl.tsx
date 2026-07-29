import { Settings, Volume2, VolumeX } from "lucide-react";
import { useId, useState } from "react";
import type { CasualAudioSettings } from "./audio";

type AudioControlProps = {
  audioEnabled: boolean;
  settings: CasualAudioSettings;
  buttonClassName: string;
  panelClassName?: string;
  onToggleAudio: () => void;
  onUpdateSettings: (settings: CasualAudioSettings) => void;
};

function percent(value: number): number {
  return Math.round(value * 100);
}

function fromSlider(value: string): number {
  return Math.min(1, Math.max(0, Number(value) / 100));
}

function shiftVolume(value: number, direction: -1 | 1): number {
  return Math.min(1, Math.max(0, Math.round(value * 100 + direction * 5) / 100));
}

export function AudioControl({
  audioEnabled,
  settings,
  buttonClassName,
  panelClassName,
  onToggleAudio,
  onUpdateSettings,
}: AudioControlProps) {
  const [open, setOpen] = useState(false);
  const bgmId = useId();
  const sfxId = useId();

  return (
    <div className="casual-audio-control">
      <button
        className={`${buttonClassName} ${audioEnabled ? "is-active" : ""}`}
        type="button"
        onClick={onToggleAudio}
        title={audioEnabled ? "关闭声音" : "开启声音"}
        aria-label={audioEnabled ? "关闭声音" : "开启声音"}
      >
        {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      <button
        className={buttonClassName}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="声音设置"
        aria-label="声音设置"
        aria-expanded={open}
      >
        <Settings size={18} />
      </button>

      {open ? (
        <section className={`casual-audio-panel ${panelClassName ?? ""}`} aria-label="声音设置面板">
          <div className="casual-audio-row">
            <label htmlFor={bgmId}>
              <span>背景音乐</span>
              <strong>{percent(settings.bgmVolume)}%</strong>
            </label>
            <div className="casual-audio-slider">
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, bgmVolume: shiftVolume(settings.bgmVolume, -1) })}
                aria-label="降低背景音乐"
              >
                －
              </button>
              <input
                id={bgmId}
                aria-label="背景音乐"
                type="range"
                min="0"
                max="100"
                step="1"
                value={percent(settings.bgmVolume)}
                onChange={(event) => onUpdateSettings({ ...settings, bgmVolume: fromSlider(event.currentTarget.value) })}
              />
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, bgmVolume: shiftVolume(settings.bgmVolume, 1) })}
                aria-label="提高背景音乐"
              >
                ＋
              </button>
            </div>
          </div>

          <div className="casual-audio-row">
            <label htmlFor={sfxId}>
              <span>音效</span>
              <strong>{percent(settings.sfxVolume)}%</strong>
            </label>
            <div className="casual-audio-slider">
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, sfxVolume: shiftVolume(settings.sfxVolume, -1) })}
                aria-label="降低音效"
              >
                －
              </button>
              <input
                id={sfxId}
                aria-label="音效"
                type="range"
                min="0"
                max="100"
                step="1"
                value={percent(settings.sfxVolume)}
                onChange={(event) => onUpdateSettings({ ...settings, sfxVolume: fromSlider(event.currentTarget.value) })}
              />
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, sfxVolume: shiftVolume(settings.sfxVolume, 1) })}
                aria-label="提高音效"
              >
                ＋
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

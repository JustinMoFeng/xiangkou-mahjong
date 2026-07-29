import { useCallback, useEffect, useRef, useState } from "react";
import {
  CasualGameAudio,
  loadCasualAudioSettings,
  saveCasualAudioSettings,
  type CasualAudioEvent,
  type CasualAudioGame,
  type CasualAudioSettings,
} from "./audio";

export function useCasualAudio(game: CasualAudioGame) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [settings, setSettings] = useState<CasualAudioSettings>(() => loadCasualAudioSettings());
  const audioRef = useRef<CasualGameAudio>();

  useEffect(() => () => audioRef.current?.disable(), []);

  useEffect(() => {
    audioRef.current?.setSettings(settings);
  }, [settings]);

  const playAudio = useCallback((event: CasualAudioEvent) => {
    audioRef.current?.play(event);
  }, []);

  const toggleAudio = useCallback(async () => {
    const audio = audioRef.current ?? new CasualGameAudio(game, settings);
    audioRef.current = audio;

    if (audio.isEnabled()) {
      audio.disable();
      setAudioEnabled(false);
      return;
    }

    void audio.enable();
    setAudioEnabled(true);
    audio.play("level-start");
  }, [game, settings]);

  const updateAudioSettings = useCallback((nextSettings: CasualAudioSettings) => {
    const saved = saveCasualAudioSettings(nextSettings);
    setSettings(saved);
  }, []);

  return {
    audioEnabled,
    settings,
    playAudio,
    toggleAudio,
    updateAudioSettings,
  };
}

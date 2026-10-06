"use client";

import { useSyncExternalStore } from "react";
import { gavel, setSoundEnabled, soundEnabled, subscribeSound } from "./sound";

/** Header button: chamber sounds on or off (off by default, remembered in this browser). */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, () => false);
  return (
    <button
      onClick={() => {
        setSoundEnabled(!on);
        if (!on) gavel();
      }}
      aria-pressed={on}
      title={on ? "Stäng av ljud (klubba och voteringssignal)" : "Slå på ljud (klubba och voteringssignal)"}
      className="rounded-full px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
    >
      {on ? "🔊 Ljud på" : "🔇 Ljud av"}
    </button>
  );
}

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

let configured = false;

/** Play the timer-end chime. Safe to call repeatedly; errors are swallowed.
 *  A fresh player per chime — a reused singleton can silently fail to restart
 *  after its first playback finishes, which made later timer-ends mute. */
export async function playTimerEndSound() {
  try {
    if (!configured) {
      configured = true;
      // Without this the chime is silent when the iPhone ringer switch is off.
      await setAudioModeAsync({ playsInSilentMode: true });
    }
    const player = createAudioPlayer(require("../../assets/sounds/timer-end.wav"));
    player.volume = 1;
    player.play();
    // Release native resources once the chime has certainly finished.
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // already released
      }
    }, 8000);
  } catch {
    // audio unavailable (e.g. simulator quirk) — haptics still fire
  }
}

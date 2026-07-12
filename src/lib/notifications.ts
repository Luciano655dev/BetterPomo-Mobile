// Local timer-end notification for when the app is backgrounded mid-timer.
// All calls are capability-guarded: expo-notifications is degraded in Expo Go,
// so failures must never break the session screen.
import * as Notifications from "expo-notifications";

let handlerSet = false;
let permissionAsked = false;

async function ensureReady(): Promise<boolean> {
  try {
    if (!handlerSet) {
      handlerSet = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
    if (!permissionAsked) {
      permissionAsked = true;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        await Notifications.requestPermissionsAsync();
      }
    }
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Ask for permission while foregrounded (iOS can't prompt from the background). */
export async function ensureNotificationPermission() {
  await ensureReady();
}

/** Schedule a "timer finished" notification `seconds` from now. Returns an id to cancel. */
export async function scheduleTimerEndNotification(
  timerName: string,
  seconds: number,
): Promise<string | null> {
  if (seconds <= 0) return null;
  try {
    if (!(await ensureReady())) return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Timer finished",
        body: `${timerName} is done — back to BetterPomo!`,
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
      },
    });
  } catch {
    return null;
  }
}

export async function cancelTimerEndNotification(id: string | null) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or notifications unavailable
  }
}

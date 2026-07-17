import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { api } from "./api";

export type PushNotificationData = {
  type?: "friend_request" | "friend_accept" | "session_invite" | "group_add" | "chat_message" | "trial_ending" | "timer_finished";
  username?: string;
  conversation_id?: string;
  entity_id?: string;
  code?: string;
  session_code?: string;
  offline?: boolean;
};

const INSTALLATION_ID_KEY = "bp_push_installation_id";
const TIMER_PREFERENCE_KEY = "bp_notification_timer_enabled";
export const PUSH_PERMISSION_PROMPTED_KEY = "bp_push_permission_prompted_v1";
export const DEFAULT_NOTIFICATION_CHANNEL_ID = "default";

let registrationInFlight: Promise<boolean> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as PushNotificationData;
    const timerIsAlreadyVisible = data.type === "timer_finished" && AppState.currentState === "active";
    return {
      shouldShowBanner: !timerIsAlreadyVisible,
      shouldShowList: !timerIsAlreadyVisible,
      shouldPlaySound: !timerIsAlreadyVisible,
      shouldSetBadge: false,
    };
  },
});

async function getInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, created);
  return created;
}

export async function getNotificationPermissionStatus(): Promise<Notifications.PermissionStatus> {
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return Notifications.PermissionStatus.UNDETERMINED;
  }
}

/** Android requires a channel before its notification permission prompt. */
async function configureNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
    name: "BetterPomo notifications",
    description: "Messages, friend activity, session invitations, and timer alerts",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 150, 250],
    enableVibrate: true,
    showBadge: true,
  });
}

/** Trigger Apple's prompt only from an explicit onboarding/settings action. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await configureNotificationChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.status === Notifications.PermissionStatus.GRANTED) return true;
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return requested.status === Notifications.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/** Session screens check capability without unexpectedly presenting a prompt. */
export async function ensureNotificationPermission(): Promise<boolean> {
  return (await getNotificationPermissionStatus()) === Notifications.PermissionStatus.GRANTED;
}

export async function registerPushDevice(): Promise<boolean> {
  if (registrationInFlight) return registrationInFlight;
  registrationInFlight = performPushRegistration().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}

async function performPushRegistration(): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === "web") return false;
  if (!(await ensureNotificationPermission())) return false;
  try {
    await configureNotificationChannel();
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      if (__DEV__) console.warn("Push registration skipped: EAS projectId is missing");
      return false;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.post("/api/notifications/devices", {
      installation_id: await getInstallationId(),
      expo_push_token: token,
      platform: Platform.OS,
    });
    return true;
  } catch (error) {
    if (__DEV__) console.warn("Push registration failed", error);
    return false;
  }
}

export async function unregisterPushDevice(): Promise<void> {
  try {
    const installationId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
    if (installationId) await api.delete(`/api/notifications/devices/${encodeURIComponent(installationId)}`);
  } catch {
    // Best effort: stale devices are disabled when Expo reports DeviceNotRegistered.
  }
}

export async function setLocalTimerNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(TIMER_PREFERENCE_KEY, enabled ? "1" : "0");
  if (!enabled) await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

async function timerNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(TIMER_PREFERENCE_KEY)) !== "0";
}

/** Schedule one local alert that iOS can deliver after the app is terminated. */
export async function scheduleTimerEndNotification(
  timerName: string,
  seconds: number,
  data: PushNotificationData = {},
): Promise<string | null> {
  if (seconds <= 0 || !(await timerNotificationsEnabled())) return null;
  try {
    if (!(await ensureNotificationPermission())) return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "Pomodoro complete",
        body: `${timerName} is finished. Time for the next step.`,
        sound: "default",
        data: { ...data, type: "timer_finished" },
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

export async function cancelTimerEndNotification(id: string | null): Promise<void> {
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

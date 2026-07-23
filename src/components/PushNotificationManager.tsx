import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useDialog } from "@/components/ui/dialog";
import { useInvalidate, useNotificationPreferences, useProfile } from "@/lib/hooks";
import { subscribe as subscribeToNetwork } from "@/lib/network";
import {
  getNotificationPermissionStatus,
  PUSH_PERMISSION_PROMPTED_KEY,
  registerPushDevice,
  requestNotificationPermission,
  setLocalTimerNotificationsEnabled,
  type PushNotificationData,
} from "@/lib/notifications";
import { useAuth } from "@/providers/AuthProvider";

export function PushNotificationManager() {
  const router = useRouter();
  const dialog = useDialog();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const { data: preferences } = useNotificationPreferences();
  const { invalidateChat, invalidateNotifications } = useInvalidate();
  const lastResponseId = useRef<string | null>(null);
  const permissionPromptInFlight = useRef(false);

  useEffect(() => {
    if (!session?.user.id) return;
    void registerPushDevice();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void registerPushDevice();
    });
    const unsubscribeNetwork = subscribeToNetwork((online) => {
      if (online) void registerPushDevice();
    });
    const tokenSub = Notifications.addPushTokenListener(() => { void registerPushDevice(); });
    return () => {
      appState.remove();
      unsubscribeNetwork();
      tokenSub.remove();
    };
  }, [session?.user.id]);

  // Push was introduced after many accounts had already completed onboarding.
  // Give those existing users the same explicit, one-time opt-in instead of
  // silently skipping registration forever while permission is undetermined.
  useEffect(() => {
    if (!session?.user.id || profile?.onboarding_completed !== true || permissionPromptInFlight.current) return;
    let cancelled = false;

    async function offerPushNotifications() {
      try {
        if ((await getNotificationPermissionStatus()) !== Notifications.PermissionStatus.UNDETERMINED) return;
        if (cancelled || (await AsyncStorage.getItem(PUSH_PERMISSION_PROMPTED_KEY)) === "1") return;
        if (cancelled) return;

        const enable = await dialog.confirm({
          title: "Turn on notifications?",
          message: "Get an alert when someone messages you, sends a friend request, or invites you to a focus session.",
          confirmText: "Turn on",
          cancelText: "Not now",
        });
        if (cancelled) return;
        await AsyncStorage.setItem(PUSH_PERMISSION_PROMPTED_KEY, "1");
        if (!enable) return;

        const granted = await requestNotificationPermission();
        if (!granted) return;
        const registered = await registerPushDevice();
        if (!registered) {
          dialog.toast("Notifications are enabled, but this phone could not be connected. Try again in Settings.", "error");
        }
      } catch {
        if (!cancelled) dialog.toast("Could not set up notifications. Try again in Settings.", "error");
      } finally {
        permissionPromptInFlight.current = false;
      }
    }

    // Deferring avoids colliding with the onboarding redirect and makes the
    // setup/cleanup safe under React's development Strict Mode replay.
    const timer = setTimeout(() => {
      permissionPromptInFlight.current = true;
      void offerPushNotifications();
    }, 750);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dialog, profile?.onboarding_completed, session?.user.id]);

  useEffect(() => {
    if (preferences) void setLocalTimerNotificationsEnabled(preferences.timers);
  }, [preferences]);

  useEffect(() => {
    function open(response: Notifications.NotificationResponse | null) {
      if (!response || response.notification.request.identifier === lastResponseId.current) return;
      lastResponseId.current = response.notification.request.identifier;
      const data = response.notification.request.content.data as PushNotificationData;
      switch (data.type) {
        case "friend_request":
          router.push("/notifications?tab=requests" as Href);
          break;
        case "friend_accept":
          if (data.username) router.push(`/u/${encodeURIComponent(data.username)}` as Href);
          break;
        case "session_invite":
        case "group_add":
        case "chat_message":
          if (data.conversation_id ?? data.entity_id) {
            router.push(`/messages/${data.conversation_id ?? data.entity_id}` as Href);
          }
          break;
        case "group_invite":
          router.push("/notifications?tab=invites" as Href);
          break;
        case "trial_ending":
          router.push("/settings");
          break;
        case "timer_finished":
          if (data.offline) router.push("/offline-session");
          else if (data.session_code) router.push(`/session/${data.session_code}` as Href);
          break;
        case "session_saved":
          router.push("/");
          break;
      }
      void Notifications.clearLastNotificationResponseAsync();
    }

    void Notifications.getLastNotificationResponseAsync().then(open);
    const responseSub = Notifications.addNotificationResponseReceivedListener(open);
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as PushNotificationData;
      if (data.type === "chat_message") invalidateChat();
      else invalidateNotifications();
    });
    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [invalidateChat, invalidateNotifications, router]);

  return null;
}

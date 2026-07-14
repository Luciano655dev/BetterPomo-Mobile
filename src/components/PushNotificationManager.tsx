import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { registerPushDevice, setLocalTimerNotificationsEnabled, type PushNotificationData } from "@/lib/notifications";
import { useInvalidate, useNotificationPreferences } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";

export function PushNotificationManager() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: preferences } = useNotificationPreferences();
  const { invalidateChat, invalidateNotifications } = useInvalidate();
  const lastResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user.id) return;
    void registerPushDevice();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void registerPushDevice();
    });
    const tokenSub = Notifications.addPushTokenListener(() => { void registerPushDevice(); });
    return () => {
      appState.remove();
      tokenSub.remove();
    };
  }, [session?.user.id]);

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
          if (data.conversation_id) router.push(`/messages/${data.conversation_id}` as Href);
          break;
        case "trial_ending":
          router.push("/settings");
          break;
        case "timer_finished":
          if (data.offline) router.push("/offline-session");
          else if (data.session_code) router.push(`/session/${data.session_code}` as Href);
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

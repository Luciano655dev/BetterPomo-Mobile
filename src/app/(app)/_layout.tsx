import { Redirect, Stack } from "expo-router";
import React from "react";
import { NotificationRealtime } from "@/components/NotificationRealtime";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { OfflineSyncGate } from "@/components/OfflineSyncGate";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { useAuth } from "@/providers/AuthProvider";

export default function AppLayout() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;

  return (
    <>
      <NotificationRealtime />
      <PushNotificationManager />
      <OfflineSyncGate />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create" options={{ presentation: "modal" }} />
      <Stack.Screen name="join" options={{ presentation: "modal" }} />
      <Stack.Screen
        name="session/[code]"
        options={{ presentation: "fullScreenModal", gestureEnabled: false }}
      />
      <Stack.Screen
        name="offline-session"
        options={{ presentation: "fullScreenModal", gestureEnabled: false }}
      />
      <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="group/[id]" />
      <Stack.Screen name="group-invite/[token]" />
      <Stack.Screen name="upgrade" options={{ presentation: "modal" }} />
      </Stack>
      <OfflineBanner />
    </>
  );
}

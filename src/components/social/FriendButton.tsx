import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useFriendshipStatus, useInvalidate } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";

interface Props {
  username: string;
  targetId: string;
}

export function FriendButton({ username, targetId }: Props) {
  const { colors } = useTheme();
  const { data, isLoading } = useFriendshipStatus(username);
  const { invalidateFriends, invalidateNotifications } = useInvalidate();
  const [busy, setBusy] = useState(false);

  const status = data?.status;

  async function run(action: () => Promise<unknown>, haptic = true) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (haptic) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      invalidateFriends();
      invalidateNotifications();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancelRequest() {
    const ok = await dialog.confirm({
      title: "Cancel request",
      message: `Cancel your friend request to ${username}?`,
      confirmText: "Cancel request",
      cancelText: "Keep",
      destructive: true,
    });
    if (ok) run(() => api.delete(`/api/friends/requests/${targetId}`));
  }

  async function confirmUnfriend() {
    const ok = await dialog.confirm({
      title: "Unfriend",
      message: `Remove ${username} from your friends?`,
      confirmText: "Unfriend",
      destructive: true,
    });
    if (ok) run(() => api.delete(`/api/friends/${targetId}`), false);
  }

  if (isLoading || !status || status === "self") return null;

  if (status === "none") {
    return (
      <Button
        title="Add friend"
        size="sm"
        loading={busy}
        icon={<Ionicons name="person-add-outline" size={14} color={colors.primaryForeground} />}
        onPress={() => run(() => api.post("/api/friends/requests", { username }))}
      />
    );
  }

  if (status === "pending_outgoing") {
    return (
      <Button
        title="Requested"
        size="sm"
        variant="outline"
        loading={busy}
        icon={<Ionicons name="time-outline" size={14} color={colors.foreground} />}
        onPress={confirmCancelRequest}
      />
    );
  }

  if (status === "pending_incoming") {
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          title="Accept"
          size="sm"
          loading={busy}
          icon={<Ionicons name="checkmark" size={14} color={colors.primaryForeground} />}
          onPress={() => run(() => api.post(`/api/friends/requests/${targetId}/accept`))}
        />
        <Button
          title="Decline"
          size="sm"
          variant="outline"
          disabled={busy}
          onPress={() => run(() => api.post(`/api/friends/requests/${targetId}/decline`), false)}
        />
      </View>
    );
  }

  // status === "friends"
  return (
    <Button
      title="Friends"
      size="sm"
      variant="outline"
      loading={busy}
      icon={<Ionicons name="checkmark" size={14} color={colors.foreground} />}
      onPress={confirmUnfriend}
    />
  );
}

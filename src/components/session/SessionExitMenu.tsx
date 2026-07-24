import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

interface SessionExitMenuProps {
  visible: boolean;
  sessionName: string;
  description: string;
  discardTitle: string;
  discardMessage: string;
  discardLabel: string;
  saveLabel: string;
  busyAction: "save" | "discard" | null;
  onGoHome: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onClose: () => void;
}

/**
 * A single native modal with an in-place destructive confirmation. Keeping
 * both steps in one presentation avoids dialogs being mounted behind a native
 * full-screen session route (or behind another native Modal).
 */
export function SessionExitMenu({
  visible,
  sessionName,
  description,
  discardTitle,
  discardMessage,
  discardLabel,
  saveLabel,
  busyAction,
  onGoHome,
  onDiscard,
  onSave,
  onClose,
}: SessionExitMenuProps) {
  const { colors } = useTheme();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const busy = busyAction !== null;

  function closeOrGoBack() {
    if (busy) return;
    if (confirmingDiscard) setConfirmingDiscard(false);
    else onClose();
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onShow={() => setConfirmingDiscard(false)}
      onRequestClose={closeOrGoBack}
    >
      <Pressable style={styles.backdrop} onPress={closeOrGoBack}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          {confirmingDiscard ? (
            <>
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.foreground }]}>{discardTitle}</Text>
                <Text style={[styles.description, { color: colors.mutedForeground }]}>
                  {discardMessage}
                </Text>
              </View>

              <Pressable
                onPress={onDiscard}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={discardLabel}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.muted },
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                <Text style={[styles.rowLabel, { color: colors.destructive }]}>
                  {busyAction === "discard" ? "Discarding…" : discardLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmingDiscard(false)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.row,
                  styles.cancelRow,
                  { borderTopColor: colors.border },
                  pressed && { backgroundColor: colors.muted },
                ]}
              >
                <Ionicons name="arrow-back-outline" size={18} color={colors.mutedForeground} />
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Go back</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.foreground }]}>{sessionName}</Text>
                <Text style={[styles.description, { color: colors.mutedForeground }]}>
                  {description}
                </Text>
              </View>

              <Pressable
                onPress={onGoHome}
                disabled={busy}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.muted },
                ]}
              >
                <Ionicons name="home-outline" size={18} color={colors.foreground} />
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>Go to home</Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmingDiscard(true)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={discardLabel}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.muted },
                ]}
              >
                <Ionicons name="exit-outline" size={18} color={colors.destructive} />
                <Text style={[styles.rowLabel, { color: colors.destructive }]}>{discardLabel}</Text>
              </Pressable>

              <Pressable
                onPress={onSave}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={saveLabel}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.muted },
                ]}
              >
                <Ionicons name="save-outline" size={18} color={colors.destructive} />
                <Text style={[styles.rowLabel, { color: colors.destructive }]}>
                  {busyAction === "save" ? "Saving…" : saveLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={onClose}
                disabled={busy}
                style={({ pressed }) => [
                  styles.row,
                  styles.cancelRow,
                  { borderTopColor: colors.border },
                  pressed && { backgroundColor: colors.muted },
                ]}
              >
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.56)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 18,
    overflow: "hidden",
  },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 5 },
  title: { fontSize: 15, fontFamily: fonts.sansSemiBold },
  description: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
  row: {
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowLabel: { fontSize: 15, fontFamily: fonts.sansMedium },
  cancelRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
    justifyContent: "center",
  },
});

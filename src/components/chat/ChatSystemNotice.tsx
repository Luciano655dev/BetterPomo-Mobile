import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

interface ChatSystemNoticeProps {
  message: string;
}

/** A quiet timeline divider for session and group membership events. */
export function ChatSystemNotice({ message }: ChatSystemNoticeProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row} accessibilityLabel={message}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <Text
        style={[styles.label, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}
      >
        {message}
      </Text>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 6,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth, minWidth: 16 },
  label: { maxWidth: "75%", textAlign: "center", fontSize: 10, lineHeight: 15 },
});

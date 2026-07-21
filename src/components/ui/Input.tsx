import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, style, secureTextEntry, ...props }: InputProps) {
  const { colors } = useTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = secureTextEntry === true;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}>
          {label}
        </Text>
      ) : null}
      <View style={styles.inputShell}>
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={isPassword && !passwordVisible}
          style={[
            styles.input,
            isPassword && styles.passwordInput,
            {
              backgroundColor: colors.card,
              borderColor: error ? colors.destructive : colors.border,
              color: colors.foreground,
              // System font: custom fonts misrender in native inputs (secure
              // entry dots, baseline alignment), so inputs stay platform-native.
            },
            style,
          ]}
          {...props}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setPasswordVisible((visible) => !visible)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            accessibilityState={{ expanded: passwordVisible }}
            style={styles.passwordToggle}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.destructive, fontFamily: fonts.sans }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 13 },
  inputShell: { position: "relative" },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  passwordInput: { paddingRight: 48 },
  passwordToggle: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { fontSize: 13 },
});

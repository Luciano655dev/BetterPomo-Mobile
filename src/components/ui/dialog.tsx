import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius, type ThemeTokens } from "@/theme/tokens";

// Custom in-app dialogs, action sheets, and toasts — replacements for the
// native Alert.alert / Alert.prompt (which look off-brand and, in the case of
// Alert.prompt, don't work on Android at all). Everything is promise-based and
// themed. Call the imperative `dialog` API from anywhere:
//
//   await dialog.alert({ title, message });
//   if (await dialog.confirm({ title, destructive: true })) { … }
//   const name = await dialog.prompt({ title, defaultValue });   // string | null
//   const pick = await dialog.actions({ title, options });        // value | null
//   dialog.toast("Saved", "success");

type ButtonTone = "default" | "primary" | "destructive" | "cancel";

interface AlertOptions {
  title: string;
  message?: string;
  confirmText?: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  multiline?: boolean;
  /** Optional client-side validation; return an error string to block submit. */
  validate?: (value: string) => string | null;
}

export interface ActionOption {
  label: string;
  value: string;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface ActionsOptions {
  title?: string;
  message?: string;
  options: ActionOption[];
  cancelText?: string;
}

export type ToastType = "success" | "error" | "info";

interface DialogApi {
  alert(opts: AlertOptions): Promise<void>;
  confirm(opts: ConfirmOptions): Promise<boolean>;
  prompt(opts: PromptOptions): Promise<string | null>;
  actions(opts: ActionsOptions): Promise<string | null>;
  toast(message: string, type?: ToastType): void;
}

// ── Imperative singleton (works outside the React tree / in callbacks) ────────

interface DialogHost {
  api: DialogApi;
  priority: number;
}

const hosts: DialogHost[] = [];

function activeHost(): DialogApi | null {
  return hosts.reduce<DialogHost | null>(
    (active, candidate) =>
      !active || candidate.priority >= active.priority ? candidate : active,
    null,
  )?.api ?? null;
}

export const dialog: DialogApi = {
  alert: (o) => activeHost()?.alert(o) ?? Promise.resolve(),
  confirm: (o) => activeHost()?.confirm(o) ?? Promise.resolve(false),
  prompt: (o) => activeHost()?.prompt(o) ?? Promise.resolve(null),
  actions: (o) => activeHost()?.actions(o) ?? Promise.resolve(null),
  toast: (m, t) => activeHost()?.toast(m, t),
};

const DialogContext = createContext<DialogApi>(dialog);
export function useDialog(): DialogApi {
  return useContext(DialogContext);
}

// ── Internal descriptor for the currently-shown modal ─────────────────────────

type ModalState =
  | { kind: "alert"; opts: AlertOptions; resolve: () => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: "actions"; opts: ActionsOptions; resolve: (v: string | null) => void };

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export function DialogProvider({
  children,
  priority = 0,
}: {
  children: React.ReactNode;
  priority?: number;
}) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  // Lazy state (not a ref) so it's created once and can be read during render.
  const [api] = useState<DialogApi>(() => ({
    alert: (opts) => new Promise<void>((resolve) => setModal({ kind: "alert", opts, resolve })),
    confirm: (opts) =>
      new Promise<boolean>((resolve) => setModal({ kind: "confirm", opts, resolve })),
    prompt: (opts) =>
      new Promise<string | null>((resolve) => setModal({ kind: "prompt", opts, resolve })),
    actions: (opts) =>
      new Promise<string | null>((resolve) => setModal({ kind: "actions", opts, resolve })),
    toast: (message, type = "info") => {
      const id = ++toastId.current;
      setToasts((cur) => [...cur, { id, message, type }]);
      setTimeout(() => removeToast(id), 3200);
    },
  }));

  // Nested native presentations mount their own provider. Keep a stack so the
  // topmost screen receives dialogs and the root host is restored on unmount.
  useEffect(() => {
    const entry = { api, priority };
    hosts.push(entry);
    return () => {
      const index = hosts.lastIndexOf(entry);
      if (index >= 0) hosts.splice(index, 1);
    };
  }, [api, priority]);

  const close = useCallback(() => setModal(null), []);

  // On iOS, screens presented as native modals (create/join/session/…) sit in
  // their own view controller above the root view, hiding a root-level toast
  // stack entirely. FullWindowOverlay hosts the toasts in a window above every
  // presentation; it passes touches through where it has no children. Android
  // keeps screens in one window, so the plain absolute view already works.
  const toastStack = <ToastStack toasts={toasts} onDismiss={removeToast} />;
  return (
    <DialogContext.Provider value={api}>
      {children}
      {modal && <DialogModal state={modal} onClose={close} />}
      {Platform.OS === "ios" && toasts.length > 0 ? (
        <FullWindowOverlay>{toastStack}</FullWindowOverlay>
      ) : (
        toastStack
      )}
    </DialogContext.Provider>
  );
}

// ── Modal renderer ────────────────────────────────────────────────────────────

function DialogModal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(state.kind === "prompt" ? (state.opts.defaultValue ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const styles = makeStyles(colors);

  // Action sheets slide up from the bottom (native convention + thumb-reachable);
  // alert/confirm/prompt stay centered.
  const isSheet = state.kind === "actions";

  // The Modal's built-in "slide" animates the whole surface — backdrop included —
  // so the dark overlay visibly slides up too. Instead we fade the Modal (backdrop
  // fades in place) and slide ONLY the card via its own transform.
  const [slide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!isSheet) return;
    Animated.timing(slide, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSheet, slide]);
  const cardTranslateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get("window").height, 0],
  });

  const settle = useCallback(
    (fn: () => void) => {
      fn();
      onClose();
    },
    [onClose],
  );

  function dismiss() {
    // Backdrop tap / hardware back — resolve as a cancel for each kind.
    if (state.kind === "alert") settle(() => state.resolve());
    else if (state.kind === "confirm") settle(() => state.resolve(false));
    else if (state.kind === "prompt") settle(() => state.resolve(null));
    else settle(() => state.resolve(null));
  }

  function submitPrompt() {
    if (state.kind !== "prompt") return;
    const trimmed = value.trim();
    const validationError = state.opts.validate?.(trimmed) ?? null;
    if (validationError) {
      setError(validationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    settle(() => state.resolve(trimmed));
  }

  const card = (
    <Pressable
      style={
        isSheet
          ? [styles.sheetCard, { paddingBottom: insets.bottom + 6 }]
          : styles.card
      }
      onPress={(e) => e.stopPropagation()}
    >
      {state.kind === "actions" ? (
        <ActionsBody
          opts={state.opts}
          onPick={(v) => settle(() => state.resolve(v))}
          onCancel={dismiss}
        />
      ) : (
              <View style={styles.body}>
                <Text style={styles.title}>{state.opts.title}</Text>
                {"message" in state.opts && state.opts.message ? (
                  <Text style={styles.message}>{state.opts.message}</Text>
                ) : null}

                {state.kind === "prompt" && (
                  <>
                    <View style={styles.promptInputShell}>
                      <TextInput
                        value={value}
                        onChangeText={(t) => {
                          setValue(t);
                          if (error) setError(null);
                        }}
                        placeholder={state.opts.placeholder}
                        placeholderTextColor={colors.mutedForeground}
                        secureTextEntry={state.opts.secureTextEntry && !passwordVisible}
                        keyboardType={state.opts.keyboardType}
                        autoCapitalize={state.opts.autoCapitalize ?? "sentences"}
                        autoCorrect={false}
                        autoFocus
                        multiline={state.opts.multiline}
                        onSubmitEditing={state.opts.multiline ? undefined : submitPrompt}
                        style={[
                          styles.input,
                          state.opts.secureTextEntry && styles.inputSecure,
                          { borderColor: error ? colors.destructive : colors.border },
                          state.opts.multiline && styles.inputMultiline,
                        ]}
                      />
                      {state.opts.secureTextEntry ? (
                        <Pressable
                          onPress={() => setPasswordVisible((visible) => !visible)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
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
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  </>
                )}

                <View style={styles.buttonRow}>
                  {state.kind === "alert" ? (
                    <DialogButton
                      label={state.opts.confirmText ?? "OK"}
                      tone="primary"
                      onPress={() => settle(() => state.resolve())}
                    />
                  ) : (
                    <>
                      <DialogButton
                        label={state.opts.cancelText ?? "Cancel"}
                        tone="cancel"
                        onPress={dismiss}
                      />
                      <DialogButton
                        label={
                          state.kind === "prompt"
                            ? (state.opts.confirmText ?? "Save")
                            : (state.opts.confirmText ?? "Confirm")
                        }
                        tone={
                          "destructive" in state.opts && state.opts.destructive
                            ? "destructive"
                            : "primary"
                        }
                        onPress={
                          state.kind === "prompt"
                            ? submitPrompt
                            : () => settle(() => (state as Extract<ModalState, { kind: "confirm" }>).resolve(true))
                        }
                      />
                    </>
                  )}
                </View>
              </View>
            )}
    </Pressable>
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={[styles.backdrop, isSheet && styles.backdropSheet]} onPress={dismiss}>
          {isSheet ? (
            <Animated.View style={{ width: "100%", transform: [{ translateY: cardTranslateY }] }}>
              {card}
            </Animated.View>
          ) : (
            card
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ActionsBody({
  opts,
  onPick,
  onCancel,
}: {
  opts: ActionsOptions;
  onPick: (value: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.actionsBody}>
      {(opts.title || opts.message) && (
        <View style={styles.actionsHeader}>
          {opts.title ? <Text style={styles.actionsTitle}>{opts.title}</Text> : null}
          {opts.message ? <Text style={styles.message}>{opts.message}</Text> : null}
        </View>
      )}
      {opts.options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onPick(opt.value)}
          style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.muted }]}
        >
          {opt.icon ? (
            <Ionicons
              name={opt.icon}
              size={18}
              color={opt.destructive ? colors.destructive : colors.foreground}
            />
          ) : null}
          <Text
            style={[
              styles.actionLabel,
              { color: opt.destructive ? colors.destructive : colors.foreground },
            ]}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [
          styles.actionRow,
          styles.actionCancel,
          { borderTopColor: colors.border },
          pressed && { backgroundColor: colors.muted },
        ]}
      >
        <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>
          {opts.cancelText ?? "Cancel"}
        </Text>
      </Pressable>
    </View>
  );
}

function DialogButton({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: ButtonTone;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const filled = tone === "primary" || tone === "destructive";
  const bg = tone === "primary" ? colors.foreground : tone === "destructive" ? colors.destructive : "transparent";
  const fg = filled
    ? tone === "destructive"
      ? colors.destructiveForeground
      : colors.background
    : tone === "cancel"
      ? colors.mutedForeground
      : colors.foreground;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        {
          flex: 1,
          height: 44,
          borderRadius: radius.lg,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: filled ? 0 : 1,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: fg }}>{label}</Text>
    </Pressable>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────────────

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.toastWrap, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </View>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { colors } = useTheme();
  // Lazy state (not a ref) so reading `anim` during render is allowed.
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [anim]);

  const accent =
    item.type === "success" ? colors.success : item.type === "error" ? colors.destructive : colors.foreground;
  const icon =
    item.type === "success" ? "checkmark-circle" : item.type === "error" ? "alert-circle" : "information-circle";

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
      }}
    >
      <Pressable
        onPress={onDismiss}
        style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Ionicons name={icon} size={18} color={accent} />
        <Text
          numberOfLines={2}
          style={{ flex: 1, fontSize: 13, fontFamily: fonts.sansMedium, color: colors.foreground }}
        >
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ThemeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      padding: 28,
    },
    // Bottom-sheet variant (action sheets): dock to the bottom edge, full width.
    backdropSheet: {
      justifyContent: "flex-end",
      alignItems: "stretch",
      padding: 0,
    },
    card: {
      alignSelf: "stretch",
      maxWidth: 420,
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: radius["2xl"],
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    sheetCard: {
      width: "100%",
      backgroundColor: colors.card,
      borderTopLeftRadius: radius["2xl"],
      borderTopRightRadius: radius["2xl"],
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      overflow: "hidden",
    },
    body: { padding: 20, gap: 10 },
    title: { fontSize: 17, fontFamily: fonts.sansBold, color: colors.foreground },
    message: { fontSize: 14, lineHeight: 20, fontFamily: fonts.sans, color: colors.mutedForeground },
    promptInputShell: { position: "relative" },
    input: {
      marginTop: 4,
      height: 46,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: fonts.sans,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    inputSecure: { paddingRight: 48 },
    passwordToggle: {
      position: "absolute",
      right: 0,
      top: 4,
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    inputMultiline: { height: 96, paddingTop: 12, textAlignVertical: "top" },
    errorText: { fontSize: 12, color: colors.destructive, fontFamily: fonts.sans },
    buttonRow: { flexDirection: "row", gap: 10, marginTop: 8 },
    actionsBody: { paddingVertical: 6 },
    actionsHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 4 },
    actionsTitle: { fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 15,
    },
    actionCancel: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
    actionLabel: { fontSize: 15, fontFamily: fonts.sansMedium },
  });
}

const styles = StyleSheet.create({
  toastWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    gap: 8,
    alignItems: "center",
    zIndex: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 460,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

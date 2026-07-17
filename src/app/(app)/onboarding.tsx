import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";
import { api } from "@/lib/api";
import { useInvalidate, useProfile } from "@/lib/hooks";
import {
  getNotificationPermissionStatus,
  PUSH_PERMISSION_PROMPTED_KEY,
  registerPushDevice,
  requestNotificationPermission,
} from "@/lib/notifications";
import { dialog } from "@/components/ui/dialog";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

type FocusCategory = "study" | "work" | "build" | "read" | "other";
type FocusStyle = "solo" | "friends" | "team";
type FocusPeak = "morning" | "afternoon" | "evening" | "night";
type Struggle = "procrastination" | "distractions" | "consistency" | "burnout";

type Option<T extends string> = { value: T; label: string; hint?: string; icon: IoniconName };

const CATEGORY_OPTIONS: Option<FocusCategory>[] = [
  { value: "study", label: "Study", icon: "school-outline" },
  { value: "work", label: "Work", icon: "briefcase-outline" },
  { value: "build", label: "Build", icon: "hammer-outline" },
  { value: "read", label: "Read", icon: "book-outline" },
  { value: "other", label: "Other", icon: "sparkles-outline" },
];

const STYLE_OPTIONS: Option<FocusStyle>[] = [
  { value: "solo", label: "Mostly alone", hint: "Quick solo sessions, on your schedule", icon: "person-outline" },
  { value: "friends", label: "With friends", hint: "Shared rooms with your study crew", icon: "people-outline" },
  { value: "team", label: "With a team", hint: "Focused blocks with coworkers", icon: "business-outline" },
];

const PEAK_OPTIONS: Option<FocusPeak>[] = [
  { value: "morning", label: "Morning", hint: "First hours of the day", icon: "partly-sunny-outline" },
  { value: "afternoon", label: "Afternoon", hint: "Post-lunch momentum", icon: "sunny-outline" },
  { value: "evening", label: "Evening", hint: "When the day quiets down", icon: "cloudy-night-outline" },
  { value: "night", label: "Late night", hint: "When everyone else is asleep", icon: "moon-outline" },
];

const STRUGGLE_OPTIONS: Option<Struggle>[] = [
  { value: "procrastination", label: "Getting started", hint: "I put things off until the last minute", icon: "hourglass-outline" },
  { value: "distractions", label: "Staying focused", hint: "My phone and tabs always win", icon: "phone-portrait-outline" },
  { value: "consistency", label: "Showing up daily", hint: "Great weeks, then nothing", icon: "repeat-outline" },
  { value: "burnout", label: "Pacing myself", hint: "I overdo it, then crash", icon: "flame-outline" },
];

// Personalized results copy — product facts only, no invented statistics.
const STRUGGLE_INSIGHT: Record<Struggle, { title: string; body: string }> = {
  procrastination: {
    title: "Starting is the hard part — so we made it one tap.",
    body: "A session takes seconds to create, and once a timer is running with other people in the room, backing out gets a lot harder than starting did.",
  },
  distractions: {
    title: "Focus is easier when someone's watching the clock with you.",
    body: "A shared timer everyone can see, chat that waits for the break, and ambient sounds to drown the noise — the room holds your attention so you don't have to fight for it.",
  },
  consistency: {
    title: "Every session goes on your record.",
    body: "Your history and stats build automatically — streaks of focused days, hours per project — so showing up tomorrow has something real to add to.",
  },
  burnout: {
    title: "Breaks are built in, not optional.",
    body: "Pomodoro alternates work and rest on purpose. The timer tells you when to stop — and your stats show your real pace, not just your longest day.",
  },
};

const STYLE_INSIGHT: Record<FocusStyle, string> = {
  solo: "Solo sessions are one tap away — and when you want company, one code brings people in.",
  friends: "Share one six-character code and your friends are in your room, on your timer.",
  team: "One code puts your whole team on the same clock — no calendar invites, no installs.",
};

const PEAK_LABEL: Record<FocusPeak, string> = {
  morning: "a morning person",
  afternoon: "an afternoon focuser",
  evening: "an evening focuser",
  night: "a night owl",
};

const EXPLAINERS: { icon: IoniconName; kicker: string; title: string; body: string }[] = [
  {
    icon: "keypad-outline",
    kicker: "HOW IT WORKS",
    title: "Everything happens in sessions.",
    body: "Create a session and you get a short code. Share it and anyone can join — same timer, same room, perfectly in sync for everyone. Public or private, with a password if you want it.",
  },
  {
    icon: "chatbubbles-outline",
    kicker: "TOGETHER",
    title: "Feel the room, skip the noise.",
    body: "See who's focusing with you, chat between rounds, and add friends to see when they're in a session. Messages disappear after 24 hours — it's a focus app, not another inbox.",
  },
  {
    icon: "stats-chart-outline",
    kicker: "YOUR RECORD",
    title: "See your time add up.",
    body: "Every session is saved with your real focused time, tasks, and the people you worked with. Streaks, hours per project, personal stats — built automatically, on the record.",
  },
];

const LOADING_STEPS = [
  "Reading your answers…",
  "Shaping your focus profile…",
  "Personalizing your sessions…",
];

const ONBOARDED_KEY = "bp_onboarded";
const PROFILE_EMOJIS = ["🍅", "🤖", "🦊", "🐸", "💙", "🌙", "🔥", "🎯"];
// Steps: 0 welcome · 1-4 questions · 5 loading · 6 results · 7-9 explainers · 10 handoff
const TOTAL_STEPS = 11;


type ThemeColors = ReturnType<typeof useTheme>["colors"];

function OptionCard<T extends string>({
  opt,
  selected,
  onPress,
  index,
  colors,
}: {
  opt: Option<T>;
  selected: boolean;
  onPress: () => void;
  index: number;
  colors: ThemeColors;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(300)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.optionCard,
          {
            backgroundColor: selected ? colors.foreground : colors.card,
            borderColor: selected ? colors.foreground : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Ionicons name={opt.icon} size={22} color={selected ? colors.background : colors.foreground} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionLabel, { color: selected ? colors.background : colors.foreground, fontFamily: fonts.sansSemiBold }]}>
            {opt.label}
          </Text>
          {opt.hint ? (
            <Text style={[styles.optionHint, { color: selected ? colors.background : colors.mutedForeground, opacity: selected ? 0.75 : 1, fontFamily: fonts.sans }]}>
              {opt.hint}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Question<T extends string>({
  number,
  title,
  subtitle,
  options,
  value,
  onPick,
  colors,
}: {
  number: number;
  title: string;
  subtitle: string;
  options: Option<T>[];
  value: T | null;
  onPick: (v: T) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.kicker, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}>
        QUESTION {number} OF 4
      </Text>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>{subtitle}</Text>
      <View style={{ gap: 10, marginTop: 24 }}>
        {options.map((opt, i) => (
          <OptionCard key={opt.value} opt={opt} index={i} selected={value === opt.value} onPress={() => onPick(opt.value)} colors={colors} />
        ))}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { invalidateProfile } = useInvalidate();
  const { data: profile } = useProfile();

  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);

  const [category, setCategory] = useState<FocusCategory | null>(null);
  const [style, setStyle] = useState<FocusStyle | null>(null);
  const [peak, setPeak] = useState<FocusPeak | null>(null);
  const [struggle, setStruggle] = useState<Struggle | null>(null);
  const [identityDraft, setIdentityDraft] = useState<{
    displayName: string; username: string; bio: string; emoji: string;
  } | null>(null);
  const identity = identityDraft ?? {
    displayName: profile?.display_name ?? "",
    username: profile?.username ?? "",
    bio: profile?.bio ?? "",
    emoji: profile?.emoji ?? "🍅",
  };

  // Loading beat: cycle messages, then reveal the results. The i=0 timeout resets
  // the message index, so no synchronous setState is needed in the effect body.
  useEffect(() => {
    if (step !== 5) return;
    const timers = LOADING_STEPS.map((_, i) => setTimeout(() => setLoadingMsg(i), i * 800));
    const done = setTimeout(() => setStep(6), LOADING_STEPS.length * 800 + 600);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [step]);

  const finish = useCallback(
    async (dest: "back" | "create") => {
      if (leaving) return;
      setLeaving(true);
      try {
        await api.patch("/api/profile", {
          onboarding_completed: true,
          ...(profile && identity.displayName.trim() ? { display_name: identity.displayName.trim() } : {}),
          ...(profile && identity.username.trim() ? { username: identity.username.trim() } : {}),
          ...(profile ? { emoji: identity.emoji, bio: identity.bio.trim() || null } : {}),
          ...(category ? { focus_category: category } : {}),
          ...(style ? { focus_style: style } : {}),
          ...(peak ? { focus_peak: peak } : {}),
        });
        invalidateProfile();
        try { await AsyncStorage.setItem(ONBOARDED_KEY, "1"); } catch {}
      } catch (error) {
        setLeaving(false);
        dialog.toast(error instanceof Error ? error.message : "Could not save your profile", "error");
        return;
      }
      if ((await getNotificationPermissionStatus()) === "undetermined") {
        const enable = await dialog.confirm({
          title: "Stay on track",
          message: "BetterPomo can tell you when a Pomodoro ends, a friend responds, or someone invites you to focus. You can choose each category in Settings.",
          confirmText: "Enable notifications",
          cancelText: "Not now",
        });
        try { await AsyncStorage.setItem(PUSH_PERMISSION_PROMPTED_KEY, "1"); } catch {}
        if (enable && await requestNotificationPermission()) await registerPushDevice();
      }
      if (dest === "create") router.replace("/create");
      else router.back();
    },
    [leaving, category, style, peak, invalidateProfile, router, profile, identity.displayName, identity.username, identity.emoji, identity.bio]
  );

  function back() {
    setStep((s) => (s === 6 ? 4 : s > 0 && s !== 5 ? s - 1 : s));
  }

  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);
  const showBack = (step >= 2 && step <= 4) || step === 6 || (step >= 7 && step <= 9);

  const chips = [
    category && CATEGORY_OPTIONS.find((o) => o.value === category)?.label,
    style && STYLE_OPTIONS.find((o) => o.value === style)?.label,
    peak && PEAK_OPTIONS.find((o) => o.value === peak)?.label,
    struggle && STRUGGLE_OPTIONS.find((o) => o.value === struggle)?.label,
  ].filter(Boolean) as string[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* thin progress line */}
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.foreground, width: `${progress}%` }]} />
      </View>

      {/* header row */}
      <View style={styles.headerRow}>
        {showBack ? (
          <Pressable onPress={back} hitSlop={10} disabled={leaving}>
            <Ionicons name="arrow-back" size={20} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <View style={{ width: 20 }} />
        )}
        <Pressable onPress={() => finish("back")} hitSlop={10} disabled={leaving}>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={step} entering={FadeIn.duration(250)}>
          {/* 0 · Welcome */}
          {step === 0 && (
            <View style={styles.center}>
              <Logo size={64} />
              <Text style={[styles.heroTitle, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
                Focus is better,{"\n"}together.
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }]}>
                BetterPomo is a shared focus timer — you and your people, on the
                same clock, with every focused minute saved to your record.
              </Text>
              <Text style={[styles.fineprint, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
                Four quick questions to set things up. Takes under a minute.
              </Text>
            </View>
          )}

          {/* 1-4 · Questions */}
          {step === 1 && (
            <Question
              colors={colors}
              number={1}
              title="What do you usually focus on?"
              subtitle="We'll suggest session names that fit your work."
              options={CATEGORY_OPTIONS}
              value={category}
              onPick={(v) => { setCategory(v); setStep(2); }}
            />
          )}
          {step === 2 && (
            <Question
              colors={colors}
              number={2}
              title="How do you usually focus?"
              subtitle="BetterPomo works solo and together — this shapes what we put first."
              options={STYLE_OPTIONS}
              value={style}
              onPick={(v) => { setStyle(v); setStep(3); }}
            />
          )}
          {step === 3 && (
            <Question
              colors={colors}
              number={3}
              title="When do you focus best?"
              subtitle="Everyone has a window where deep work comes easier."
              options={PEAK_OPTIONS}
              value={peak}
              onPick={(v) => { setPeak(v); setStep(4); }}
            />
          )}
          {step === 4 && (
            <Question
              colors={colors}
              number={4}
              title="What gets in your way most?"
              subtitle="Be honest — this is where BetterPomo earns its keep."
              options={STRUGGLE_OPTIONS}
              value={struggle}
              onPick={(v) => { setStruggle(v); setStep(5); }}
            />
          )}

          {/* 5 · Loading beat */}
          {step === 5 && (
            <View style={styles.center}>
              <Animated.View entering={FadeIn.duration(400)}>
                <Logo size={56} />
              </Animated.View>
              <Animated.Text
                key={loadingMsg}
                entering={FadeIn.duration(300)}
                style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 28 }]}
              >
                {LOADING_STEPS[loadingMsg]}
              </Animated.Text>
            </View>
          )}

          {/* 6 · Results */}
          {step === 6 && (
            <View style={styles.stepBody}>
              <Text style={[styles.kicker, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}>
                YOUR FOCUS PROFILE
              </Text>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
                {peak ? `You're ${PEAK_LABEL[peak]}` : "You're ready"}
                {style === "solo" ? ", mostly solo." : style === "friends" ? " — with friends." : style === "team" ? " — with a team." : "."}
              </Text>

              <View style={styles.chipRow}>
                {chips.map((label) => (
                  <View key={label} style={[styles.chip, { borderColor: colors.border }]}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>{label}</Text>
                  </View>
                ))}
              </View>

              {struggle ? (
                <Animated.View
                  entering={FadeInDown.delay(150).duration(400)}
                  style={[styles.insightCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Text style={[styles.insightTitle, { color: colors.foreground, fontFamily: fonts.sansSemiBold }]}>
                    {STRUGGLE_INSIGHT[struggle].title}
                  </Text>
                  <Text style={[styles.insightBody, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
                    {STRUGGLE_INSIGHT[struggle].body}
                  </Text>
                </Animated.View>
              ) : null}
              {style ? (
                <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 14 }]}>
                  {STYLE_INSIGHT[style]}
                </Text>
              ) : null}
            </View>
          )}

          {/* 7-9 · Explainers */}
          {step >= 7 && step <= 9 && (
            <View style={styles.center}>
              <View style={[styles.iconBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={EXPLAINERS[step - 7].icon} size={36} color={colors.foreground} />
              </View>
              <Text style={[styles.kicker, { color: colors.mutedForeground, fontFamily: fonts.sansMedium, marginTop: 20 }]}>
                {EXPLAINERS[step - 7].kicker}
              </Text>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold, textAlign: "center", marginTop: 8 }]}>
                {EXPLAINERS[step - 7].title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }]}>
                {EXPLAINERS[step - 7].body}
              </Text>
            </View>
          )}

          {/* 10 · Handoff */}
          {step === 10 && (
            <View style={styles.center}>
              <Logo size={52} />
              <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold, marginTop: 20 }]}>
                Make it yours.
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }]}>
                This is how other people will recognize you. You can change it again anytime.
              </Text>
              <View style={{ alignSelf: "stretch", gap: 12, marginTop: 18 }}>
                <Input label="Display name" value={identity.displayName} onChangeText={(t) => setIdentityDraft({ ...identity, displayName: t.slice(0, 50) })} />
                <Input
                  label="Username"
                  value={identity.username}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(t) => setIdentityDraft({ ...identity, username: t.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) })}
                />
                <Input label="Bio" value={identity.bio} onChangeText={(t) => setIdentityDraft({ ...identity, bio: t.slice(0, 300) })} placeholder="A little about you" />
                <Text style={[styles.kicker, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}>YOUR EMOJI</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PROFILE_EMOJIS.map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${item} emoji`}
                      accessibilityState={{ selected: identity.emoji === item }}
                      onPress={() => setIdentityDraft({ ...identity, emoji: item })}
                      style={{
                        width: 42, height: 42, alignItems: "center", justifyContent: "center",
                        borderRadius: radius.md, borderWidth: 1,
                        borderColor: identity.emoji === item ? colors.foreground : colors.border,
                        backgroundColor: identity.emoji === item ? colors.muted : colors.card,
                      }}
                    >
                      <Text style={{ fontSize: 21 }}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* footer actions (question steps advance by picking an answer) */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {step === 0 && <Button title="Get started" size="lg" onPress={() => setStep(1)} haptic />}
        {step === 6 && <Button title="See how it works" size="lg" onPress={() => setStep(7)} haptic />}
        {step >= 7 && step <= 9 && (
          <Button title={step === 9 ? "Almost there" : "Next"} size="lg" onPress={() => setStep(step + 1)} haptic />
        )}
        {step === 10 && (
          <View style={{ gap: 10 }}>
            <Button title="Start your first session" size="lg" onPress={() => finish("create")} haptic disabled={leaving} />
            <Button title="Go to dashboard" size="lg" variant="outline" onPress={() => finish("back")} disabled={leaving} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 3, width: "100%" },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  progressFill: { height: 3 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  center: { alignItems: "center", gap: 14, paddingVertical: 24 },
  stepBody: { paddingVertical: 12 },
  heroTitle: { fontSize: 30, lineHeight: 36, textAlign: "center", marginTop: 20 },
  kicker: { fontSize: 11, letterSpacing: 1.5 },
  title: { fontSize: 24, lineHeight: 30, marginTop: 10 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  fineprint: { fontSize: 12, marginTop: 4 },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionLabel: { fontSize: 15 },
  optionHint: { fontSize: 12.5, marginTop: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  insightCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 18,
    marginTop: 22,
  },
  insightTitle: { fontSize: 16, lineHeight: 22 },
  insightBody: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  iconBadge: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});

// Paywall: native in-app purchases via RevenueCat. The plan flips when
// RevenueCat's webhook reaches our API, so after a purchase we poll
// GET /api/billing until the entitlement lands. Requires a dev/EAS build —
// in Expo Go (no native module) the screen degrades to a "subscribe on the
// web" note so nothing crashes.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { BILLING_ENABLED } from "@/lib/billing-flags";
import { useBilling, useInvalidate, type Billing } from "@/lib/hooks";
import {
  getPaywallPackages,
  purchasePackage,
  purchasesAvailable,
  restorePurchases,
  type PaywallPackage,
} from "@/lib/purchases";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

const PRO_FEATURES = [
  "Full focus history — every session, forever",
  "Week, month & year stats",
  "Private & password-protected sessions",
  "Sessions & groups with up to 25 people",
  "10 timers + session templates",
  "Full sound library + your own uploads",
  "PRO badge on your profile",
];

const TIMELINE = [
  {
    icon: "checkmark-circle" as const,
    day: "Today",
    title: "Your trial starts",
    desc: "Instant access to everything in Pro.",
  },
  {
    icon: "notifications" as const,
    day: "Day 5",
    title: "We remind you",
    desc: "Email + in-app alert before the trial ends — no surprises.",
  },
  {
    icon: "star" as const,
    day: "Day 7",
    title: "Your subscription begins",
    desc: "Keep everything you've unlocked. Cancel anytime before this day and pay nothing.",
  },
];

/** Poll the API until the webhook lands (or give up after ~20s). */
async function waitForPlanFlip(): Promise<Billing | null> {
  for (let i = 0; i < 10; i++) {
    try {
      const billing = await api.get<Billing>("/api/billing");
      if (billing.entitlements.isPro) return billing;
    } catch {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

export default function UpgradeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: billing } = useBilling();

  // Paid plans switched off — nothing links here, but bail out defensively.
  useEffect(() => {
    if (!BILLING_ENABLED) router.back();
  }, [router]);
  const { invalidateBilling } = useInvalidate();
  const [packages, setPackages] = useState<PaywallPackage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);

  const isPro = billing?.entitlements.isPro ?? false;
  const trialAvailable = billing ? !billing.trial_used : true;

  useEffect(() => {
    getPaywallPackages().then((pkgs) => {
      setPackages(pkgs);
      // Preselect the annual package (best value), else the first one.
      const annual = pkgs.find((p) => p.packageType === "annual");
      setSelected((annual ?? pkgs[0])?.identifier ?? null);
    });
  }, []);

  async function buy() {
    const pkg = packages.find((p) => p.identifier === selected);
    if (!pkg) return;
    setBusy("purchase");
    try {
      const completed = await purchasePackage(pkg);
      if (completed) {
        const flipped = await waitForPlanFlip();
        invalidateBilling();
        if (flipped) {
          await dialog.alert({
            title: flipped.plan === "lifetime" ? "You're in — for life 🎉" : "Welcome to Pro ✨",
            message:
              flipped.plan_status === "trialing"
                ? "Everything is unlocked for the next 7 days. We'll remind you before your subscription begins on day 7 — cancel anytime before then."
                : "Everything is unlocked. Thanks for supporting BetterPomo!",
          });
        } else {
          await dialog.alert({
            title: "Purchase received",
            message: "Your purchase is confirmed and will activate in a moment.",
          });
        }
        router.back();
      }
    } catch (e) {
      dialog.alert({ title: "Purchase failed", message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      await restorePurchases();
      const flipped = await waitForPlanFlip();
      invalidateBilling();
      dialog.alert({
        title: flipped ? "Purchases restored" : "Nothing to restore",
        message: flipped
          ? "Your plan is active again."
          : "We couldn't find a previous purchase for this account.",
      });
    } catch (e) {
      dialog.alert({ title: "Restore failed", message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const selectedPkg = packages.find((p) => p.identifier === selected);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={{ fontSize: 24, fontFamily: fonts.sansBold, color: colors.foreground }}>
              {isPro ? "Your plan" : "Go Pro"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
              {isPro
                ? "Everything is unlocked. Thank you!"
                : trialAvailable
                  ? "Try everything free for 7 days"
                  : "Unlock everything BetterPomo has"}
            </Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Feature list */}
        <View style={[styles.card, { borderColor: colors.border }]}>
          {PRO_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={16} color={colors.foreground} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: fonts.sans }}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        {/* Trial timeline */}
        {!isPro && trialAvailable && (
          <View style={[styles.card, { borderColor: colors.border }]}>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: colors.mutedForeground,
                fontFamily: fonts.sansSemiBold,
                marginBottom: 12,
              }}
            >
              How the free trial works
            </Text>
            {TIMELINE.map((step, i) => (
              <View key={step.day} style={[styles.timelineRow, i < TIMELINE.length - 1 && styles.timelineGap]}>
                <Ionicons name={step.icon} size={20} color={colors.foreground} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                    <Text style={{ color: colors.mutedForeground }}>{step.day} — </Text>
                    {step.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
                    {step.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Packages */}
        {!isPro &&
          (purchasesAvailable ? (
            packages.length > 0 ? (
              <View style={{ gap: 8 }}>
                {packages.map((pkg) => {
                  const active = pkg.identifier === selected;
                  const label =
                    pkg.packageType === "annual"
                      ? "Yearly — best value"
                      : pkg.packageType === "monthly"
                        ? "Monthly"
                        : pkg.packageType === "lifetime"
                          ? "Lifetime — one payment, forever"
                          : pkg.title;
                  return (
                    <Pressable
                      key={pkg.identifier}
                      onPress={() => setSelected(pkg.identifier)}
                      style={[
                        styles.packageRow,
                        { borderColor: active ? colors.foreground : colors.border },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                          {label}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                          {pkg.priceString}
                        </Text>
                      </View>
                      <Ionicons
                        name={active ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={active ? colors.foreground : colors.mutedForeground}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }}>
                Loading plans…
              </Text>
            )
          ) : (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }}>
              Purchases aren&apos;t available in this build. You can subscribe on the web at
              app.betterpomo.com — your plan syncs to this app automatically.
            </Text>
          ))}

        {!isPro && purchasesAvailable && (
          <>
            <Button
              title={
                busy === "purchase"
                  ? "Processing…"
                  : selectedPkg?.packageType === "lifetime"
                    ? "Get Lifetime"
                    : trialAvailable
                      ? "Start 7-day free trial"
                      : "Subscribe"
              }
              onPress={buy}
              loading={busy === "purchase"}
              disabled={!selectedPkg || busy !== null}
              size="lg"
              haptic
            />
            <Button
              title={busy === "restore" ? "Restoring…" : "Restore purchases"}
              onPress={restore}
              variant="ghost"
              disabled={busy !== null}
            />
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }}>
              Billed through the App Store / Google Play. Cancel anytime in your store
              subscription settings.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 20, paddingTop: 28, paddingBottom: 48 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  timelineGap: { marginBottom: 14 },
  packageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

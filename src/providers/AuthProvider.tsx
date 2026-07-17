import type { Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BILLING_ENABLED } from "@/lib/billing-flags";
import { getPersistedSession, supabase } from "@/lib/supabase";
import { configurePurchases, logOutPurchases } from "@/lib/purchases";
import { unregisterPushDevice } from "@/lib/notifications";

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let restoredSession: Session | null = null;
    let authoritativeAuthEventReceived = false;

    // Never gate the splash screen on a network-backed token refresh. A
    // previously signed-in user can enter the encrypted, cached offline UI
    // immediately; Supabase's own initialization refreshes it when possible.
    getPersistedSession()
      .then((cached) => {
        if (authoritativeAuthEventReceived) return;
        restoredSession = cached;
        if (!mounted) return;
        setSession(cached);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      // An offline initialization may report no freshly validated session.
      // Keep the encrypted local session until an explicit SIGNED_OUT event;
      // online API calls remain protected by their server-validated JWTs.
      if (event === "INITIAL_SESSION" && !newSession && restoredSession) {
        setIsLoading(false);
        return;
      }
      if (newSession || event === "SIGNED_OUT") {
        authoritativeAuthEventReceived = true;
      }
      restoredSession = newSession;
      setSession(newSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // RevenueCat identity follows the Supabase session: appUserID = user id so
  // the billing webhook can map store purchases onto the profile row.
  // Inert while paid plans are switched off.
  useEffect(() => {
    if (!BILLING_ENABLED) return;
    if (session?.user?.id) void configurePurchases(session.user.id);
    else void logOutPurchases();
  }, [session?.user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signOut: async () => {
        await unregisterPushDevice();
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

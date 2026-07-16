import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";

import { OfflineSessionScreen } from "@/components/session/OfflineSessionScreen";
import { useProfile } from "@/lib/hooks";
import { loadOfflineSession, type OfflineSessionState } from "@/lib/offline-session";
import { useAuth } from "@/providers/AuthProvider";

export default function OfflineSessionRoute() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const userId = session?.user.id;
  // undefined = still loading from disk, null = nothing to resume
  const [state, setState] = useState<OfflineSessionState | null | undefined>(undefined);

  useEffect(() => {
    if (userId) loadOfflineSession(userId).then((s) => setState(s));
  }, [userId]);

  if (!userId) return <Redirect href="/login" />;
  if (state === undefined) return null;
  if (state === null) return <Redirect href="/" />;

  return (
    <OfflineSessionScreen
      initialState={state}
      userId={userId}
      username={profile?.username ?? null}
      displayName={profile?.display_name ?? null}
    />
  );
}

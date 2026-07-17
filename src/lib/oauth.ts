import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const NATIVE_OAUTH_RETURN_URL = "betterpomo://auth/callback";
const MOBILE_OAUTH_BRIDGE_URL = "https://app.betterpomo.com/auth/callback?mobile=1";

export function getOAuthRedirects() {
  const returnUrl =
    Platform.OS === "web"
      ? AuthSession.makeRedirectUri({ path: "auth/callback" })
      : AuthSession.makeRedirectUri({ native: NATIVE_OAUTH_RETURN_URL });

  return {
    returnUrl,
    redirectTo: Platform.OS === "web" ? returnUrl : MOBILE_OAUTH_BRIDGE_URL,
  };
}

export async function completeOAuthSession(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const getParam = (name: string) => url.searchParams.get(name) ?? fragment.get(name);

  const errorDescription = getParam("error_description") ?? getParam("error");
  if (errorDescription) throw new Error(errorDescription);

  const code = getParam("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const accessToken = getParam("access_token");
  const refreshToken = getParam("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  throw new Error("The sign-in provider did not return a session.");
}

// Polyfills must load before supabase-js touches URL/crypto on Hermes.
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, type Session } from "@supabase/supabase-js";
import { AppState } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

// Store the auth session in the device keychain/keystore (encrypted at rest)
// instead of plain AsyncStorage. SecureStore rejects values over ~2KB and the
// Supabase session token is larger, so we chunk: the primary key holds the chunk
// count, and `${key}.${i}` hold the pieces. Anything unexpected (no keystore,
// web target) falls back to AsyncStorage so auth never hard-fails.
const CHUNK_SIZE = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const header = await SecureStore.getItemAsync(key);
      if (header == null) {
        // One-time migration: an earlier build stored the session in AsyncStorage.
        // Move it into SecureStore so existing users aren't logged out on upgrade.
        const legacy = await AsyncStorage.getItem(key);
        if (legacy != null) {
          await secureStorage.setItem(key, legacy);
          await AsyncStorage.removeItem(key);
          return legacy;
        }
        return null;
      }
      const count = parseInt(header, 10);
      if (Number.isNaN(count)) return header; // legacy un-chunked value
      let value = "";
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        if (part == null) return null; // corrupt — treat as no session, force re-auth
        value += part;
      }
      return value;
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
      await SecureStore.setItemAsync(key, String(chunks.length));
      for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
      // Best-effort cleanup of stale chunks left by a longer previous value.
      for (let i = chunks.length; i < chunks.length + 6; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const header = await SecureStore.getItemAsync(key);
      const count = header ? parseInt(header, 10) : 0;
      await SecureStore.deleteItemAsync(key);
      if (!Number.isNaN(count)) {
        for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};

/**
 * Read the encrypted on-device session without asking Supabase to refresh it.
 * `auth.getSession()` refreshes expired access tokens and can therefore block
 * app startup when there is no network. The cached session is used only to
 * unlock this device's offline UI; every server request still validates the
 * access token normally.
 */
export async function getPersistedSession(): Promise<Session | null> {
  try {
    const raw = await secureStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Session>;
    if (
      typeof value.access_token !== "string" ||
      typeof value.refresh_token !== "string" ||
      !value.user ||
      typeof value.user.id !== "string"
    ) {
      return null;
    }
    return value as Session;
  } catch {
    return null;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

// Supabase recommends pausing token auto-refresh while the app is backgrounded.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

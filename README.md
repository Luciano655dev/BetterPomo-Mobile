# 📱 BetterPomo Mobile

The native iOS & Android client for [BetterPomo](https://github.com/luciano655dev) —
a shared, real-time Pomodoro timer. Built with Expo and expo-router, it talks to the
same [Express API](../betterpomo-api) and Supabase project as the [web app](../betterpomo-webapp),
with full feature parity plus offline sessions.

Built by [Luciano Menezes](https://github.com/luciano655dev).

---

## Features

- **Shared real-time timer** — server-authoritative countdown that survives backgrounding
- **Pomodoro & running-timer modes** — focus/break cycles or an open stopwatch with laps
- **Live chat, participants, friends & DMs**
- **Ambient sound mixer** — layer looping sounds, set each level, pause-all, and save one-tap presets
- **Offline solo sessions** — run fully offline; history syncs on reconnect
- **Local notifications** — timer-end alerts fire even while the app is backgrounded
- **Sign in** with email/password, Google, or Apple (iOS)
- **Dark / light / system themes** matching the web app

---

## Tech stack

| Concern | Technology |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 |
| Routing | expo-router |
| Data fetching | SWR (same keys/intervals as the web app) |
| Realtime & Auth | Supabase |
| Language | TypeScript |

---

## Getting started

### Prerequisites

- Node.js 18+
- Xcode (iOS Simulator) and/or Android Studio
- The [BetterPomo API](../betterpomo-api) running on `:4000`

### Setup

```bash
npm install
cp .env.example .env     # fill in Supabase URL + anon key (same as the web app)
npx expo start --ios     # iOS Simulator; API must be running on :4000
```

Point the app at the API via `EXPO_PUBLIC_API_URL`:

- **iOS Simulator** — `http://localhost:4000` works as-is.
- **Physical device (Expo Go)** — replace `localhost` with your Mac's LAN IP.
- **Android emulator** — use `http://10.0.2.2:4000`.

### Google OAuth

Google login round-trips through the system browser via Supabase PKCE. The redirect
URI must be allowlisted in the Supabase dashboard
(**Authentication → URL Configuration → Redirect URLs**):

- Dev build / production: `betterpomo://`
- Expo Go: the `exp://<lan-ip>:<port>` value logged to the console as
  `[auth] Google OAuth redirect URI:` on the login screen.

---

## Architecture

The client layer mirrors the web app so behavior stays consistent across platforms:

- `src/lib/api.ts` — port of the web app's `backend-api.ts` (Bearer token,
  `{ data }` unwrap, 401 → refresh/sign-out).
- `src/lib/hooks.ts` — SWR hooks with the same keys and refresh intervals as the web app.
- `src/lib/realtime.ts` — `uniqueChannel` helper for Supabase `postgres_changes`.
- `src/providers/SWRProvider.tsx` — wires SWR focus/visibility to `AppState`
  (revalidate on foreground, pause polling in background).
- `src/theme/tokens.ts` — hex conversions of the web app's OKLCH palette;
  light/dark/system via `ThemeContext`.

Timer state is derived from server timestamps (`timer_started_at` /
`paused_elapsed_seconds`), so countdowns stay correct across backgrounding, and a
local notification covers timer-end while the app is suspended.

Routes live in `src/app/` (expo-router):

```
(auth)/login, register, forgot-password
(app)/(tabs)/{index, search, messages, profile}
(app)/{create, join, settings, notifications, onboarding, upgrade, offline-session}
(app)/session/[code], messages/[id], u/[username]
```

---

## License

Licensed under the **BetterPomo Non-Commercial License** — see [LICENSE](./LICENSE).
Free to read, learn from, and modify **with credit**; **no commercial use**.
Contact [Luciano Menezes](https://github.com/luciano655dev) for a commercial license.

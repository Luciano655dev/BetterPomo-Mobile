// Ported from betterpomo-webapp/app/globals.css (OKLCH → hex via culori).

export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  success: string;
}

export const lightTokens: ThemeTokens = {
  background: "#f6f6f6",
  foreground: "#262626",
  card: "#fdfdfd",
  primary: "#262626",
  primaryForeground: "#fafafa",
  secondary: "#ededed",
  muted: "#ededed",
  mutedForeground: "#717171",
  accent: "#ededed",
  destructive: "#e7000b",
  destructiveForeground: "#fafafa",
  border: "#dedede",
  input: "#dedede",
  ring: "#9e9e9e",
  success: "#16a34a",
};

export const darkTokens: ThemeTokens = {
  background: "#121215",
  foreground: "#e7e7ea",
  card: "#1e1e21",
  primary: "#e7e7ea",
  primaryForeground: "#18181b",
  secondary: "#2a2a2d",
  muted: "#2a2a2d",
  mutedForeground: "#9d9da7",
  accent: "#2a2a2d",
  destructive: "#f14d4c",
  destructiveForeground: "#fafafa",
  border: "#353539",
  input: "#2a2a2d",
  ring: "#62626a",
  success: "#4ade80",
};

// --radius: 0.625rem (10px) scaled like the webapp.
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  "2xl": 18,
  "3xl": 22,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
};

export const fonts = {
  sans: "PlusJakartaSans_400Regular",
  sansMedium: "PlusJakartaSans_500Medium",
  sansSemiBold: "PlusJakartaSans_600SemiBold",
  sansBold: "PlusJakartaSans_700Bold",
  mono: "GeistMono_500Medium",
  monoSemiBold: "GeistMono_600SemiBold",
};

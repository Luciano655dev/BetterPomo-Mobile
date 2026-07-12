// RevenueCat wrapper. react-native-purchases is a native module, so it only
// exists in dev/EAS builds — never in Expo Go. Everything here degrades to
// no-ops with `purchasesAvailable === false` so the rest of the app still runs
// in Expo Go (the upgrade screen shows a fallback message instead of packages).
//
// The backend is the source of truth for the plan: purchases here are reported
// to our API by RevenueCat's webhook (POST /api/billing/revenuecat), and the
// app then re-reads GET /api/billing. Configure with appUserID = Supabase user
// id so the webhook can map events onto profiles.id.
import { Platform } from "react-native";

 
type PurchasesModule = any;

let Purchases: PurchasesModule = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Purchases = require("react-native-purchases").default;
} catch {
  Purchases = null; // Expo Go / web — native module not linked
}

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

export const purchasesAvailable = !!Purchases && !!API_KEY;

let configuredFor: string | null = null;

/** Configure (or re-configure) RevenueCat for the signed-in user. Safe to call
 *  on every auth change; it no-ops when already configured for this user. */
export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesAvailable || configuredFor === userId) return;
  try {
    Purchases.configure({ apiKey: API_KEY as string, appUserID: userId });
    configuredFor = userId;
  } catch (e) {
    console.warn("RevenueCat configure failed:", (e as Error).message);
  }
}

export async function logOutPurchases(): Promise<void> {
  if (!purchasesAvailable || !configuredFor) return;
  configuredFor = null;
  try {
    await Purchases.logOut();
  } catch {
    // anonymous already / not configured — fine
  }
}

export interface PaywallPackage {
  identifier: string;
  title: string;
  priceString: string;
  /** "monthly" | "annual" | "lifetime" | other RC package types */
  packageType: string;
   
  rcPackage: any;
}

/** Current offering's packages, normalized for the paywall screen. */
export async function getPaywallPackages(): Promise<PaywallPackage[]> {
  if (!purchasesAvailable) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) return [];
     
    return (current.availablePackages ?? []).map((p: any) => ({
      identifier: p.identifier,
      title: p.product?.title ?? p.identifier,
      priceString: p.product?.priceString ?? "",
      packageType: String(p.packageType ?? "").toLowerCase(),
      rcPackage: p,
    }));
  } catch (e) {
    console.warn("RevenueCat getOfferings failed:", (e as Error).message);
    return [];
  }
}

/** Runs the native purchase sheet. Returns true when the purchase completed
 *  (the plan itself flips when the RevenueCat webhook reaches our API).
 *  Throws on real errors; returns false on user cancellation. */
export async function purchasePackage(pkg: PaywallPackage): Promise<boolean> {
  if (!purchasesAvailable) return false;
  try {
    await Purchases.purchasePackage(pkg.rcPackage);
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

/** App Store / Play restore (required by App Store review). */
export async function restorePurchases(): Promise<void> {
  if (!purchasesAvailable) return;
  await Purchases.restorePurchases();
}

/** Native subscription-management screen (iOS) / Play subscriptions (Android). */
export async function showManageSubscriptions(): Promise<void> {
  if (!purchasesAvailable) return;
  try {
    await Purchases.showManageSubscriptions();
  } catch {
    // not supported on this platform/version — settings deep link would be next
  }
}

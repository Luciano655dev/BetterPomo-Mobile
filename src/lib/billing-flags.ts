/** Mobile half of the paid-plans kill switch (see BILLING_ENABLED in
 *  betterpomo-api/src/lib/plans.ts). Off (default): no plan card in settings,
 *  no RevenueCat configuration, and the upgrade screen shows nothing to buy —
 *  the app behaves as it did before paid plans. Set
 *  EXPO_PUBLIC_BILLING_ENABLED=true together with the API flag to activate. */
export const BILLING_ENABLED = process.env.EXPO_PUBLIC_BILLING_ENABLED === "true";

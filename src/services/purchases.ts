import { Platform } from "react-native";
import Purchases, { CustomerInfo, LOG_LEVEL } from "react-native-purchases";

const entitlementId =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "pro";

function getRevenueCatApiKey() {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || "";
  }

  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || "";
  }

  return "";
}

function hasActiveEntitlement(customerInfo: CustomerInfo) {
  return Boolean(customerInfo.entitlements.active[entitlementId]?.isActive);
}

export async function configurePurchases(appUserID: string) {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    return false;
  }

  const configured = await Purchases.isConfigured();

  if (!configured) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey, appUserID });
  }

  return true;
}

export async function getPremiumStatus() {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    return false;
  }

  const customerInfo = await Purchases.getCustomerInfo();
  return hasActiveEntitlement(customerInfo);
}

export async function purchaseForeverUnlock() {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    throw new Error(
      "RevenueCat is not configured. Add the iOS and Android public SDK keys first.",
    );
  }

  const offerings = await Purchases.getOfferings();
  const lifetimePackage =
    offerings.current?.lifetime || offerings.current?.availablePackages[0];

  if (!lifetimePackage) {
    throw new Error(
      "No lifetime package is available. Create a one-time product in RevenueCat and attach it to the current offering.",
    );
  }

  const result = await Purchases.purchasePackage(lifetimePackage);
  return hasActiveEntitlement(result.customerInfo);
}

export async function restoreForeverUnlock() {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    throw new Error(
      "RevenueCat is not configured. Add the iOS and Android public SDK keys first.",
    );
  }

  const customerInfo = await Purchases.restorePurchases();
  return hasActiveEntitlement(customerInfo);
}

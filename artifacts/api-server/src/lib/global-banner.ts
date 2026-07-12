/**
 * Global announcement banner — in-memory store.
 * Admin sets/clears it. All users see it in the dashboard.
 * Resets on server restart (acceptable for maintenance/error notices).
 */

export type BannerType = "maintenance" | "error" | "info" | "warning";

export interface GlobalBanner {
  type: BannerType;
  title: string;
  message: string;
  setAt: string; // ISO
}

let activeBanner: GlobalBanner | null = null;

export function getGlobalBanner(): GlobalBanner | null {
  return activeBanner;
}

export function setGlobalBanner(banner: Omit<GlobalBanner, "setAt">): GlobalBanner {
  activeBanner = { ...banner, setAt: new Date().toISOString() };
  return activeBanner;
}

export function clearGlobalBanner(): void {
  activeBanner = null;
}

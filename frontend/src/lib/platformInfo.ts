import { createContext, useContext } from 'react';

/** What /api/platform/info says about the address the app was opened on. */
export interface PlatformInfo {
  multiTenant: boolean;
  platformName: string;
  baseDomain: string | null;
  root: boolean;
  signupEnabled: boolean;
  supportEmail: string | null;
  notFound: boolean;
  tenant: {
    name: string;
    slug: string;
    plan: string;
    planLabel: string;
    trialEndsAt: string | null;
    paidUntil: string | null;
    state: 'ok' | 'suspended' | 'expired';
    message?: string;
  } | null;
  plans: { key: string; label: string; users: number; invoicesPerMonth: number | null }[];
}

export const PlatformInfoContext = createContext<PlatformInfo | null>(null);

/** Null in single-business installs (and before the info has loaded). */
export const usePlatformInfo = () => useContext(PlatformInfoContext);

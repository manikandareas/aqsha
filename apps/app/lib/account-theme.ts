"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { useTheme } from "next-themes";
import { api } from "@aqsha/convex/api";

export type ThemePreference = "light" | "dark" | "system";

const subscribeToMount = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useIsMounted() {
  return useSyncExternalStore(subscribeToMount, clientSnapshot, serverSnapshot);
}

export function useAccountThemePreference() {
  const themeState = useTheme();
  const { isAuthenticated } = useConvexAuth();
  const setRemoteTheme = useMutation(api.preferences.setTheme);
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const setThemePreference = async (nextTheme: ThemePreference) => {
    themeState.setTheme(nextTheme);
    setThemeError(null);
    if (!isAuthenticated) return;

    setSavingTheme(true);
    try {
      await setRemoteTheme({ theme: nextTheme });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menyimpan tema akun.";
      setThemeError(message);
    } finally {
      setSavingTheme(false);
    }
  };

  return {
    ...themeState,
    savingTheme,
    themeError,
    setThemePreference,
  };
}

export function AccountThemeSync() {
  const { isAuthenticated } = useConvexAuth();
  const preference = useQuery(api.preferences.get, isAuthenticated ? {} : "skip");
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();
  const appliedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mounted || !preference) return;
    if (appliedAtRef.current === preference.updatedAt) return;

    const remoteTheme = preference.theme;
    if ((theme ?? "system") !== remoteTheme) {
      setTheme(remoteTheme);
    }
    appliedAtRef.current = preference.updatedAt;
  }, [mounted, preference, setTheme, theme]);

  return null;
}

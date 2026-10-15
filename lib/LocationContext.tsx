"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGeolocation, type UserLocation } from "@/lib/useGeolocation";

type LocationContextValue = {
  location: UserLocation | null;
  error: string | null;
  loading: boolean;
  tracking: boolean;
  startTracking: () => void;
  stopTracking: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);
const STORAGE_KEY = "campus:location-tracking";

/**
 * Single shared source of the student's real position. Tracking only starts after the
 * student opts in (or the browser already granted permission), so no prompt appears unprompted.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [tracking, setTracking] = useState(false);
  const geo = useGeolocation(tracking);

  useEffect(() => {
    let cancelled = false;
    const optedIn = window.localStorage.getItem(STORAGE_KEY) === "on";
    if (!navigator.permissions?.query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (optedIn) setTracking(true);
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!cancelled && (status.state === "granted" || (optedIn && status.state !== "denied"))) {
          setTracking(true);
        }
      })
      .catch(() => {
        if (!cancelled && optedIn) setTracking(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startTracking = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, "on");
    setTracking(true);
  }, []);

  const stopTracking = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, "off");
    setTracking(false);
  }, []);

  const value = useMemo<LocationContextValue>(
    () => ({
      location: tracking ? geo.location : null,
      error: geo.error,
      loading: tracking && geo.loading,
      tracking,
      startTracking,
      stopTracking,
    }),
    [geo.location, geo.error, geo.loading, tracking, startTracking, stopTracking]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useUserLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useUserLocation must be used inside LocationProvider");
  return context;
}

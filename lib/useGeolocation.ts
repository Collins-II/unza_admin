import { useEffect, useState } from 'react';

export type UserLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type GeolocationState = {
  location: UserLocation | null;
  error: string | null;
  loading: boolean;
  hasPermission: boolean;
};

/**
 * Hook for tracking user's live location on campus
 * Requests geolocation permission and continuously updates position
 */
export function useGeolocation(enableTracking = false): GeolocationState & { stopTracking: () => void } {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    error: null,
    loading: false,
    hasPermission: false,
  });

  const [watchId, setWatchId] = useState<number | null>(null);

  useEffect(() => {
    if (!enableTracking) return;

    // Check if geolocation is available
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((prev) => ({
        ...prev,
        error: 'Geolocation is not supported by your browser',
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    // Get initial position
    const getPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setState({
            location: {
              lat: latitude,
              lng: longitude,
              accuracy,
              timestamp: Date.now(),
            },
            error: null,
            loading: false,
            hasPermission: true,
          });
        },
        (error) => {
          setState((prev) => ({
            ...prev,
            error: error.message || 'Failed to get location',
            loading: false,
            hasPermission: error.code === 1 ? false : true,
          }));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000, // Cache position for 1 second
          timeout: 5000,
        }
      );
    };

    getPosition();

    // Watch for continuous position updates
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setState((prev) => ({
          ...prev,
          location: {
            lat: latitude,
            lng: longitude,
            accuracy,
            timestamp: Date.now(),
          },
          error: null,
          loading: false,
          hasPermission: true,
        }));
      },
      (error) => {
        // Only set error if it's a permission issue
        if (error.code === 1) {
          setState((prev) => ({
            ...prev,
            error: 'Location permission denied',
            hasPermission: false,
          }));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );

    setWatchId(id);

    return () => {
      if (id !== null) {
        navigator.geolocation.clearWatch(id);
      }
    };
  }, [enableTracking]);

  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setState({
      location: null,
      error: null,
      loading: false,
      hasPermission: false,
    });
  };

  return { ...state, stopTracking };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate bearing (direction) from one point to another
 * Returns bearing in degrees (0-360)
 */
export function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Find nearest locations from user's current position
 */
export function findNearestLocations<T extends { lat: number; lng: number }>(
  userLat: number,
  userLng: number,
  locations: T[],
  limit = 5
) {
  return locations
    .map((location) => ({
      ...location,
      distance: calculateDistance(userLat, userLng, location.lat, location.lng),
      bearing: calculateBearing(userLat, userLng, location.lat, location.lng),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

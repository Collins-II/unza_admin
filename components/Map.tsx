"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import { haversine, pathProgress, type RouteStep } from '@/lib/routing';
import 'leaflet/dist/leaflet.css';

export type CampusMapDestination = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tag?: string;
};

export type CampusMapRoom = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  available?: boolean;
  tag?: string;
};

export type CampusRouteInfo = {
  distance: number; // meters along the path
  duration: number; // seconds
  coordinates: [number, number][]; // [lat, lng]
  steps: RouteStep[];
  source: 'road' | 'straight';
};

export type RouteProfile = 'foot' | 'bike';

export type UserLocationMarkerType = {
  lat: number;
  lng: number;
  accuracy: number;
};

// Initial view only (UNZA main campus); no placeholder places are ever shown.
const CAMPUS_CENTER: [number, number] = [-15.3925, 28.3285];

// Routes come from our own /api/route proxy (configurable provider). Falls back to a straight line.
async function fetchRoute(
  from: [number, number],
  to: [number, number],
  profile: RouteProfile,
  name: string,
  signal: AbortSignal
): Promise<CampusRouteInfo> {
  const straightDistance = haversine(from, to);
  const speed = profile === 'bike' ? 4.2 : 1.4; // m/s
  const straight: CampusRouteInfo = {
    distance: straightDistance,
    duration: straightDistance / speed,
    coordinates: [from, to],
    steps: [],
    source: 'straight',
  };

  try {
    const params = new URLSearchParams({
      from: `${from[0]},${from[1]}`,
      to: `${to[0]},${to[1]}`,
      profile,
      name,
    });
    const res = await fetch(`/api/route?${params}`, { signal });
    if (!res.ok) return straight;
    const route = await res.json();
    return {
      distance: route.distance,
      // Estimated from path length at a typical pace for the profile.
      duration: route.distance / speed,
      coordinates: route.coordinates,
      steps: route.steps ?? [],
      source: 'road',
    };
  } catch {
    return straight;
  }
}

const REROUTE_DISTANCE_M = 40;
const REROUTE_MIN_INTERVAL_MS = 10000;
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
function MapFocus({
  destination,
  hasStart,
  route,
}: {
  destination: CampusMapDestination | undefined;
  hasStart: boolean;
  route: CampusRouteInfo | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (hasStart && route && route.coordinates.length > 1) {
      map.flyToBounds(route.coordinates, { padding: [80, 80], maxZoom: 18, duration: 1 });
    } else if (destination) {
      map.flyTo([destination.lat, destination.lng], 18, { duration: 1.2 });
    }
  }, [destination, hasStart, route, map]);

  return null;
}

function LocateButton({ location }: { location: UserLocationMarkerType | null }) {
  const map = useMap();
  return (
    <button
      type="button"
      aria-label="Centre on my location"
      disabled={!location}
      onClick={() => location && map.flyTo([location.lat, location.lng], 18, { duration: 0.8 })}
      className="absolute right-4 top-24 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-700 shadow-lg disabled:text-gray-400"
    >
      <Crosshair className="h-5 w-5" />
    </button>
  );
}

function UserLocationMarker({ location }: { location: UserLocationMarkerType }) {
  return (
    <>
      <CircleMarker
        center={[location.lat, location.lng]}
        radius={Math.max(12, Math.min(location.accuracy / 5, 50))}
        pathOptions={{ color: '#4ade80', fillColor: '#4ade80', fillOpacity: 0.15, weight: 1.5, dashArray: '4 4' }}
      />
      <CircleMarker
        center={[location.lat, location.lng]}
        radius={8}
        pathOptions={{ color: '#ffffff', fillColor: '#008236', fillOpacity: 0.95, weight: 3 }}
      >
        <Popup>
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-gray-900">Your location</p>
            <p className="text-gray-600">Accuracy: ±{Math.round(location.accuracy)}m</p>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

export default function Map({
  destination,
  markers = [],
  userLocation: initialUserLocation,
  showUserLocation = true,
  className = 'h-[500px] rounded-none md:rounded-[26px] border border-gray-300 shadow-md',
  onSelect,
  onRoute,
  profile = 'foot',
}: {
  destination?: CampusMapDestination;
  markers?: CampusMapRoom[];
  userLocation?: UserLocationMarkerType;
  showUserLocation?: boolean;
  className?: string;
  onSelect?: (id: string) => void;
  onRoute?: (route: CampusRouteInfo | null) => void;
  profile?: RouteProfile;
}) {
  const [route, setRoute] = useState<CampusRouteInfo | null>(null);

  const activeUserLocation = showUserLocation ? initialUserLocation ?? null : null;
  const startLat = activeUserLocation?.lat;
  const startLng = activeUserLocation?.lng;

  // ~11m grid so GPS jitter does not retrigger the re-route check every second
  const startKey =
    startLat !== undefined && startLng !== undefined ? `${startLat.toFixed(4)},${startLng.toFixed(4)}` : null;
  const hasStart = startKey !== null;

  const startRef = useRef<[number, number] | null>(null);
  const lastFetchRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    startRef.current = startLat !== undefined && startLng !== undefined ? [startLat, startLng] : null;
  });

  // Fetch when a start exists and the destination/profile changes, or a re-route is requested.
  useEffect(() => {
    const start = startRef.current;
    if (!hasStart || !start || !destination) {
        setRoute(null);
      onRoute?.(null);
      return;
    }
    const controller = new AbortController();
    lastFetchRef.current = Date.now();
    void fetchRoute(start, [destination.lat, destination.lng], profile, destination.name, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setRoute(result);
        onRoute?.(result);
      }
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStart, destination?.lat, destination?.lng, profile, tick]);

  // Re-route only when the user leaves the path (or retry a failed road route).
  useEffect(() => {
    const start = startRef.current;
    if (!route || !start) return;
    if (Date.now() - lastFetchRef.current < REROUTE_MIN_INTERVAL_MS) return;
    const off =
      route.source === 'road' ? pathProgress(route.coordinates, start).offPath > REROUTE_DISTANCE_M : true;
    if (off) setTick((n) => n + 1);
  }, [startKey, route]);
  const routePoints = useMemo(() => route?.coordinates ?? [], [route]);

  return (
    <div className={`relative w-full overflow-hidden bg-gray-100 ${className}`}>
      <MapContainer
        center={destination ? [destination.lat, destination.lng] : CAMPUS_CENTER}
        zoom={17}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={TILE_URL}
          maxZoom={19}
        />

        <MapFocus destination={destination} hasStart={hasStart} route={route} />
        <LocateButton location={activeUserLocation} />

        {routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{
              color: '#008236',
              weight: 6,
              opacity: 0.9,
              dashArray: route?.source === 'straight' ? '2 10' : undefined,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {activeUserLocation && <UserLocationMarker location={activeUserLocation} />}

        {markers.map((room) => (
          <CircleMarker
            key={room.id}
            center={[room.lat, room.lng]}
            eventHandlers={{ click: () => onSelect?.(room.id) }}
            radius={room.id === destination?.id ? 16 : 12}
            pathOptions={{
              color: room.available === false ? '#f59e0b' : '#008236',
              fillColor: room.available === false ? '#f59e0b' : '#4ade80',
              fillOpacity: room.id === destination?.id ? 0.95 : 0.8,
              weight: room.id === destination?.id ? 3 : 2,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm text-gray-900">
                <p className="font-semibold">{room.name}</p>
                <p className="text-gray-600">{room.available === false ? 'Busy right now' : 'Available now'}</p>
                {room.tag ? <p className="font-medium text-gray-700">{room.tag}</p> : null}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

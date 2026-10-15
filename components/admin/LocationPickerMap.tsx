"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const campusCenter: [number, number] = [-15.3922, 28.3283];
const customIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function LocationMarker({ selectedCoords, onSelectCoords }: { selectedCoords: [number, number] | null; onSelectCoords: (coords: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      onSelectCoords([event.latlng.lat, event.latlng.lng]);
    },
  });

  return selectedCoords ? <Marker position={selectedCoords} icon={customIcon} /> : null;
}

function RecenterMap({ selectedCoords }: { selectedCoords: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedCoords) map.setView(selectedCoords, Math.max(map.getZoom(), 16));
  }, [map, selectedCoords]);

  return null;
}

export default function LocationPickerMap({ selectedCoords, onSelectCoords, center = campusCenter }: { selectedCoords: [number, number] | null; onSelectCoords: (coords: [number, number]) => void; center?: [number, number] }) {
  return (
    <div className="relative h-64 w-full overflow-hidden rounded border-2 border-[#052e16]">
      <MapContainer center={selectedCoords || center} zoom={16} scrollWheelZoom className="z-0 h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <RecenterMap selectedCoords={selectedCoords} />
        <LocationMarker selectedCoords={selectedCoords} onSelectCoords={onSelectCoords} />
      </MapContainer>
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] bg-[#052e16]/90 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow">Click the map to drop a pin</div>
    </div>
  );
}

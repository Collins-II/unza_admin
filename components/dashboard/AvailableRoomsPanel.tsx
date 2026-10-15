import Link from 'next/link';
import { MapPinned } from 'lucide-react';

import { RoomStatusBadge } from '@/components/dashboard/RoomAvailabilityStatus';

type RoomOption = {
  id: string;
  name: string;
  code: string;
  floor: string;
  capacity: number;
  isAvailable?: boolean;
  description?: string;
};

type AvailableRoomsPanelProps = {
  rooms: RoomOption[];
};

export function AvailableRoomsPanel({ rooms }: AvailableRoomsPanelProps) {
  const visibleRooms = rooms.filter((room) => room.isAvailable !== false).slice(0, 3);
  const focusRoom = visibleRooms[0] ?? null;

  return (
    <div className="rounded-md border border-gray-200 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-xl shadow-indigo-950/10">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
          <MapPinned className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-700/80">Available rooms</p>
          <h3 className="text-lg font-semibold text-gray-900">{focusRoom?.name || 'No rooms loaded'}</h3>
        </div>
      </div>

      <div className="space-y-3 text-sm text-gray-600">
        {visibleRooms.length ? (
          visibleRooms.map((room) => (
            <div key={room.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900">{room.name}</div>
                  <div className="mt-1 text-[11px] text-gray-600">{room.code} · {room.floor}</div>
                </div>
                <RoomStatusBadge status={room.isAvailable === false ? 'busy' : 'available'} compact />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-600">
                <span>{room.capacity} seats</span>
                <span>{room.description || 'Ready for booking'}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/40 p-4 text-sm text-gray-600">
            No lecture rooms are currently available in the database.
          </div>
        )}
      </div>

      <Link href="/bookings" className="mt-5 inline-flex justify-center w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-[10px] font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-100">
        Reserve room
      </Link>
    </div>
  );
}

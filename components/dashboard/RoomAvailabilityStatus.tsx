import { useEffect, useState } from 'react';

type RoomStatus = 'loading' | 'available' | 'busy' | 'unknown';

type RoomAvailabilityStatusProps = {
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  compact?: boolean;
};

type RoomStatusBadgeProps = {
  status: RoomStatus;
  compact?: boolean;
  className?: string;
};

export function RoomStatusBadge({ status, compact = false, className = '' }: RoomStatusBadgeProps) {
  const label = status === 'available' ? 'Available' : status === 'busy' ? 'Busy' : status === 'loading' ? 'Checking...' : 'Unknown';
  const chip = status === 'available' ? 'Open' : status === 'busy' ? 'Booked' : status === 'loading' ? 'Live' : 'Check';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ${
        status === 'available'
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20'
          : status === 'busy'
            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-500/20'
            : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
      } ${className}`}
    >
      {compact ? label : `${label} · ${chip}`}
    </span>
  );
}

export function RoomAvailabilityStatus({
  roomName,
  date,
  startTime,
  endTime,
  compact = false,
}: RoomAvailabilityStatusProps) {
  const [status, setStatus] = useState<RoomStatus>(() =>
    roomName && date && startTime && endTime ? 'loading' : 'unknown'
  );
  const [message, setMessage] = useState(() =>
    roomName && date && startTime && endTime
      ? 'Checking room status...'
      : 'Choose a date and time to check availability.'
  );

  useEffect(() => {
    const hasInputs = Boolean(roomName && date && startTime && endTime);

    if (!hasInputs) {
      return;
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      setStatus('loading');
      setMessage('Checking room status...');

      try {
        const response = await fetch(
          `/api/rooms?room=${encodeURIComponent(roomName)}&date=${date}&start=${startTime}&end=${endTime}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error('Unable to check room status.');
        }

        const data = await response.json();
        const matchedRoom = (data.rooms || []).find((room: { name: string }) => room.name === roomName);

        if (!matchedRoom) {
          setStatus('busy');
          setMessage(`The room "${roomName}" is unavailable for this time slot.`);
          return;
        }

        if (!matchedRoom.isAvailable) {
          setStatus('busy');
          setMessage(`The room "${roomName}" is already booked for that time.`);
          return;
        }

        setStatus('available');
        setMessage(`The room "${roomName}" is available for the selected time.`);
      } catch {
        setStatus('unknown');
        setMessage('Room status could not be verified right now.');
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [roomName, date, startTime, endTime]);

  const hasInputs = Boolean(roomName && date && startTime && endTime);
  const effectiveStatus = hasInputs ? status : 'unknown';
  const effectiveMessage = hasInputs ? message : 'Choose a date and time to check availability.';
  const isAvailable = effectiveStatus === 'available';
  const isBusy = effectiveStatus === 'busy';

  return (
    <div className={`rounded-2xl border px-3 py-2 text-sm ${
      effectiveStatus === 'available'
        ? 'border-emerald-500/30 bg-emerald-50 text-emerald-700'
        : effectiveStatus === 'busy'
          ? 'border-amber-500/30 bg-amber-50 text-amber-800'
          : 'border-gray-300 bg-gray-50 text-gray-600'
    }`}>
      {compact ? (
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{effectiveStatus === 'loading' ? 'Checking...' : isAvailable ? 'Available' : isBusy ? 'Busy' : 'Unknown'}</span>
          <RoomStatusBadge status={effectiveStatus} compact />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span>{effectiveMessage}</span>
          <RoomStatusBadge status={effectiveStatus} />
        </div>
      )}
    </div>
  );
}

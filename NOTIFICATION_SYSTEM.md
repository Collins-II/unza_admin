# Notification System Documentation

## Overview

The notification system is a comprehensive solution for managing user notifications in the Campus Navigator app. It includes:

- **Database Model**: MongoDB-backed notification storage with automatic expiration
- **API Routes**: Full REST API for managing notifications
- **React Hooks**: Custom hooks for consuming notifications on the client
- **UI Components**: Ready-to-use notification UI components
- **Helper Functions**: Server-side functions for creating notifications

## Architecture

### Database Layer

**Model**: `lib/database/models/Notification.ts`

Stores all notifications with:
- User reference
- Notification type and priority
- Title, message, and description
- Related IDs (booking, room, order)
- Read/unread status with timestamps
- Automatic expiration (30 days default)
- Metadata for extensibility

```typescript
interface INotification {
  user: ObjectId;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  description?: string;
  actionUrl?: string;
  relatedId?: { bookingId?, roomId?, orderId? };
  isRead: boolean;
  isDeleted: boolean;
  expiresAt: Date;
}
```

### API Routes

#### `GET /api/notifications`
Fetch user's notifications with filtering and pagination

**Query Parameters**:
- `filter`: `"all"` | `"unread"` | `"read"` (default: `"all"`)
- `limit`: number (max 100, default 50)
- `skip`: number (default 0)

**Response**:
```json
{
  "notifications": [ { ...notification } ],
  "total": 150,
  "limit": 50,
  "skip": 0
}
```

#### `POST /api/notifications`
Create a new notification

**Request Body**:
```json
{
  "type": "booking_confirmed",
  "title": "Booking Confirmed",
  "message": "Your booking is confirmed",
  "description": "Room: Engineering Building",
  "priority": "high",
  "actionUrl": "/booking/123",
  "actionLabel": "View Booking",
  "relatedId": {
    "bookingId": "booking_id",
    "roomId": "room_id"
  },
  "metadata": {}
}
```

#### `PATCH /api/notifications/[id]`
Mark notification as read/unread or delete it

**Request Body**:
```json
{
  "isRead": true,
  "action": "delete"  // optional
}
```

#### `DELETE /api/notifications/[id]`
Delete a notification (soft delete)

#### `GET /api/notifications/unread`
Get unread notification count

**Response**:
```json
{
  "unreadCount": 5,
  "totalCount": 150
}
```

#### `POST /api/notifications/unread`
Mark all notifications as read

#### `GET /api/notifications/preferences`
Get user's notification preferences

**Response**:
```json
{
  "email": true,
  "sms": false,
  "push": true,
  "weeklyDigest": true
}
```

#### `PATCH /api/notifications/preferences`
Update notification preferences

**Request Body**:
```json
{
  "email": true,
  "sms": false,
  "push": true,
  "weeklyDigest": true
}
```

## Client-Side Usage

### Hooks

#### `useNotifications()`

Main hook for managing notifications on the client side.

```typescript
import { useNotifications } from '@/lib/useNotifications';

export function MyComponent() {
  const {
    notifications,      // Array of NotificationResponse
    unreadCount,       // Number of unread notifications
    loading,           // Loading state
    error,            // Error message or null
    fetchNotifications,    // (filter?: 'all' | 'unread' | 'read') => Promise<void>
    markAsRead,        // (id: string) => Promise<void>
    markAsUnread,      // (id: string) => Promise<void>
    deleteNotification,    // (id: string) => Promise<void>
    markAllAsRead,     // () => Promise<void>
    createNotification,    // (type, title, message, options) => Promise<void>
  } = useNotifications();

  return (
    <div>
      <p>Unread: {unreadCount}</p>
      {notifications.map(notif => (
        <div key={notif.id}>{notif.title}</div>
      ))}
    </div>
  );
}
```

#### `useToast()`

Toast notifications for temporary feedback.

```typescript
import { useToast } from '@/components/notifications';

export function MyComponent() {
  const toast = useToast();

  const handleAction = () => {
    toast.success('Action completed!', 'Details here');
    toast.error('Something went wrong', 'Error details');
    toast.info('Information', 'Info details');
    toast.warning('Warning', 'Warning details');
  };

  return <button onClick={handleAction}>Trigger Toast</button>;
}
```

### Components

#### `NotificationBell`

Display notification bell with unread badge.

```typescript
import { NotificationBell } from '@/components/notifications';
import { useNotifications } from '@/lib/useNotifications';

export function Header() {
  const { unreadCount } = useNotifications();
  
  return <NotificationBell unreadCount={unreadCount} />;
}
```

#### `NotificationCenter`

Full notification center panel (used in the bell dropdown).

```typescript
import { NotificationCenter } from '@/components/notifications';

export function NotificationPanel() {
  return (
    <div className="w-96 h-96">
      <NotificationCenter onClose={() => console.log('closed')} />
    </div>
  );
}
```

#### `NotificationPreferencesModal`

Modal for managing notification preferences.

```typescript
import { NotificationPreferencesModal } from '@/components/notifications';
import { useState } from 'react';

export function Settings() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Preferences</button>
      <NotificationPreferencesModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

#### `ToastProvider` & `ToastContainer`

Setup in layout/providers:

```typescript
// app/providers.tsx
import { ToastProvider } from '@/components/notifications';

export function Providers({ children }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
```

## Server-Side Usage

### Creating Notifications

Use helper functions from `lib/notificationHelpers.ts`:

```typescript
import {
  notifyBookingConfirmed,
  notifyPaymentReceived,
  notifySystemAlert,
} from '@/lib/notificationHelpers';

// In an API route or server action
export async function POST(req: Request) {
  // ... do something ...
  
  // Create booking notification
  await notifyBookingConfirmed(
    userId,
    'Engineering Building Room 101',
    '2024-09-15',
    '14:00 - 16:00',
    bookingId
  );

  // Create payment notification
  await notifyPaymentReceived(
    userId,
    'ZMW 500',
    'TXN-123456',
    orderId
  );

  return Response.json({ success: true });
}
```

### Available Helpers

```typescript
// Booking notifications
notifyBookingConfirmed(userId, roomName, date, time, bookingId?)
notifyBookingCancelled(userId, roomName, reason?, bookingId?)
notifyBookingReminder(userId, roomName, minutesUntil, bookingId?)
notifyRoomReleaseSoon(userId, roomName, minutesUntil, bookingId?)

// Payment notifications
notifyPaymentReceived(userId, amount, transactionId, orderId?)
notifyPaymentFailed(userId, amount, reason, orderId?)
notifyPaymentReminder(userId, amount, daysUntil, orderId?)

// System notifications
notifySystemAlert(userId, title, message)
notifySystemMaintenance(userId, startTime, endTime, message?)
notifySystemAnnouncement(userId, title, message)

// Other
notifyRoomAvailable(userId, roomName, price?, roomId?)
notifyUserMessage(userId, senderName, message)
```

### Direct API Calls

For more control, use `createNotification()`:

```typescript
import { createNotification } from '@/lib/notificationHelpers';

await createNotification(userId, {
  type: 'booking_confirmed',
  priority: 'high',
  title: 'Booking Confirmed',
  message: 'Your booking is ready',
  actionUrl: '/booking/123',
  relatedId: { bookingId: '123' },
});
```

## Notification Types

```typescript
type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_reminder'
  | 'room_available'
  | 'payment_received'
  | 'payment_failed'
  | 'payment_reminder'
  | 'system_alert'
  | 'system_maintenance'
  | 'system_announcement'
  | 'user_message'
  | 'room_release_soon';
```

## Priority Levels

```typescript
type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
```

## Integration Points

### Booking API (`app/api/bookings/route.ts`)

When a booking is created or confirmed:

```typescript
import { notifyBookingConfirmed } from '@/lib/notificationHelpers';

// After creating booking
await notifyBookingConfirmed(
  session.user.id,
  roomDoc.name,
  new Date(startTime).toLocaleDateString(),
  `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`,
  booking._id.toString()
);
```

### Payment API (`app/api/commerce/callback/route.ts`)

When payment is processed:

```typescript
import { notifyPaymentReceived } from '@/lib/notificationHelpers';

// After successful payment
await notifyPaymentReceived(
  userId,
  `ZMW ${amount}`,
  transactionId,
  order._id.toString()
);
```

### Dashboard (`app/dashboard/page.tsx`)

Show new notifications on page load:

```typescript
import { useToast } from '@/components/notifications';
import { useNotifications } from '@/lib/useNotifications';

export function Dashboard() {
  const toast = useToast();
  const { notifications } = useNotifications();

  useEffect(() => {
    const newNotifications = notifications.filter(
      n => !n.isRead && isNewNotification(new Date(n.createdAt), 1)
    );

    newNotifications.forEach(notif => {
      toast.info(notif.title, notif.message);
    });
  }, [notifications, toast]);

  return <div>...</div>;
}
```

## Features

### ✅ Implemented

- [x] Database model with TTL index for auto-expiration
- [x] Full CRUD API routes with authentication
- [x] Read/unread status tracking
- [x] Soft delete (doesn't permanently remove from DB)
- [x] Notification filtering by type and status
- [x] User preferences (email, SMS, push, digest)
- [x] Toast notifications for real-time feedback
- [x] Notification center with badge
- [x] Helper functions for common notifications
- [x] Automatic polling every 30 seconds
- [x] Color-coded by type and priority
- [x] Formatted timestamps ("2h ago", etc)
- [x] Action links for related items
- [x] Mobile responsive UI

### 🔄 Suggested Future Enhancements

- [ ] WebSocket/real-time notifications instead of polling
- [ ] Email notifications (integration with email service)
- [ ] SMS notifications (integration with SMS provider)
- [ ] Push notifications (web push or mobile app)
- [ ] Notification scheduling/delays
- [ ] Bulk operations (delete multiple, mark multiple as read)
- [ ] Notification templates with customization
- [ ] Notification history/archive
- [ ] Notification search
- [ ] Export notifications as CSV/PDF
- [ ] Admin panel for sending system notifications
- [ ] Analytics on notification performance

## Styling

All components use Tailwind CSS with the following color scheme:

- **Success**: Green (`bg-green-50`, `text-green-800`)
- **Error**: Red (`bg-red-50`, `text-red-800`)
- **Info**: Blue (`bg-blue-50`, `text-blue-800`)
- **Warning**: Yellow/Amber (`bg-yellow-50`, `text-yellow-800`)
- **Accent**: Emerald for campus features

## Testing

### Test Creating a Notification

1. Go to `/notifications`
2. Click "Preferences" and enable desired channels
3. In browser console, call:
   ```javascript
   fetch('/api/notifications', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       type: 'booking_confirmed',
       title: 'Test Notification',
       message: 'This is a test',
       priority: 'high'
     })
   })
   ```
4. The notification should appear in the center

### Test Toast Notifications

In any component using `useToast()`:

```typescript
const toast = useToast();

// In a click handler or effect
toast.success('Title', 'Message');
toast.error('Error Title', 'Error details');
```

## Environment Variables

No additional environment variables required beyond existing app setup.

## Performance

- **Polling**: Every 30 seconds for unread count
- **Batch queries**: Compounds indexes on `(user, isRead, isDeleted, createdAt)`
- **TTL index**: Auto-removes notifications after 30 days
- **Soft deletes**: Notifications can be restored if needed
- **Pagination**: Default 50 per page, max 100

## Security

- ✅ Authentication required on all endpoints
- ✅ Users can only access their own notifications
- ✅ Server-side validation of all inputs
- ✅ Soft deletes (no permanent data loss)
- ✅ Priority-based access control ready for admin features

## File Structure

```
lib/
  notifications.ts              # Types, templates, utilities
  notificationHelpers.ts        # Server-side helpers
  useNotifications.ts           # React hook
  database/models/
    Notification.ts             # MongoDB model
app/api/notifications/
  route.ts                      # GET/POST notifications
  [id]/route.ts                 # PATCH/DELETE individual
  unread/route.ts               # Unread count & mark all
  preferences/route.ts          # Preference management
app/notifications/
  page.tsx                       # Full notifications page
components/notifications/
  index.ts                       # Exports
  NotificationBell.tsx           # Bell icon with dropdown
  NotificationCenter.tsx         # Center panel
  NotificationPreferencesModal.tsx  # Settings modal
  Toast.tsx                      # Toast system
```

## Troubleshooting

### Notifications not showing?

1. Check browser console for errors
2. Verify user is authenticated (`useSession()`)
3. Check API in Network tab
4. Ensure `ToastProvider` is in layout
5. Check MongoDB connection in `.env`

### Unread count not updating?

1. Polling happens every 30 seconds - wait or refresh
2. Check `/api/notifications/unread` endpoint
3. Verify notifications are `isRead: false` in DB

### Styling issues?

1. Ensure Tailwind CSS is configured
2. Check `globals.css` imports
3. Verify `ToastContainer` is rendered in provider

## API Response Examples

### Get Notifications

```json
{
  "notifications": [
    {
      "id": "507f1f77bcf86cd799439011",
      "user": "507f1f77bcf86cd799439012",
      "type": "booking_confirmed",
      "priority": "high",
      "title": "Booking Confirmed",
      "message": "Your booking for Engineering Building is confirmed",
      "description": "Date: 09/15/2024, Time: 14:00 - 16:00",
      "icon": null,
      "actionUrl": "/booking/507f1f77bcf86cd799439013",
      "actionLabel": "View Booking",
      "relatedId": {
        "bookingId": "507f1f77bcf86cd799439013"
      },
      "isRead": false,
      "readAt": null,
      "isDeleted": false,
      "createdAt": "2024-09-15T10:30:00Z",
      "updatedAt": "2024-09-15T10:30:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "skip": 0
}
```

---

**Last Updated**: 2024-09-15
**Version**: 1.0.0

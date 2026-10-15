# Notification System Quick Reference Card

## 🚀 Quick Start (Copy-Paste Ready)

### Send Booking Confirmation
```typescript
import { notifyBookingConfirmed } from '@/lib/notificationHelpers';

await notifyBookingConfirmed(
  userId,
  'Engineering Building',
  '09/15/2024',
  '14:00 - 16:00',
  bookingId
);
```

### Send Payment Success
```typescript
import { notifyPaymentReceived } from '@/lib/notificationHelpers';

await notifyPaymentReceived(
  userId,
  'ZMW 500',
  'TXN-123456',
  orderId
);
```

### Show Toast Notification (React)
```typescript
import { useToast } from '@/components/notifications';

const toast = useToast();
toast.success('Booking confirmed!', 'Check your notifications');
toast.error('Payment failed', 'Please try again');
toast.info('Info message');
toast.warning('Warning message');
```

### Get Notifications (React)
```typescript
import { useNotifications } from '@/lib/useNotifications';

const { 
  notifications,      // Array of notifications
  unreadCount,       // Number unread
  loading,           // Is loading?
  markAsRead,        // Mark as read
  markAsUnread,      // Mark as unread
  deleteNotification // Delete
} = useNotifications();
```

### Display Bell Icon (React)
```typescript
import { NotificationBell } from '@/components/notifications';
import { useNotifications } from '@/lib/useNotifications';

const { unreadCount } = useNotifications();
<NotificationBell unreadCount={unreadCount} />
```

---

## 📋 Helper Functions Available

### Booking Notifications
```typescript
notifyBookingConfirmed(userId, roomName, date, time, bookingId?)
notifyBookingCancelled(userId, roomName, reason?, bookingId?)
notifyBookingReminder(userId, roomName, minutesUntil, bookingId?)
notifyRoomReleaseSoon(userId, roomName, minutesUntil, bookingId?)
```

### Payment Notifications
```typescript
notifyPaymentReceived(userId, amount, transactionId, orderId?)
notifyPaymentFailed(userId, amount, reason, orderId?)
notifyPaymentReminder(userId, amount, daysUntil, orderId?)
```

### System Notifications
```typescript
notifySystemAlert(userId, title, message)
notifySystemMaintenance(userId, startTime, endTime, message?)
notifySystemAnnouncement(userId, title, message)
notifyRoomAvailable(userId, roomName, price?, roomId?)
notifyUserMessage(userId, senderName, message)
```

---

## 🎨 Notification Types

| Type | Color | Use |
|------|-------|-----|
| `booking_confirmed` | Green | Booking created |
| `booking_cancelled` | Red | Booking removed |
| `booking_reminder` | Blue | Starting soon |
| `payment_received` | Green | Payment done |
| `payment_failed` | Red | Payment error |
| `system_alert` | Red | Important |
| `system_announcement` | Blue | Info |
| `user_message` | Gray | Message |

---

## 🔗 API Endpoints

```
GET    /api/notifications                    // Get all
POST   /api/notifications                    // Create new
PATCH  /api/notifications/[id]              // Update one
DELETE /api/notifications/[id]              // Delete one
GET    /api/notifications/unread            // Get count
POST   /api/notifications/unread            // Mark all read
GET    /api/notifications/preferences       // Get prefs
PATCH  /api/notifications/preferences       // Update prefs
```

---

## 📁 File Locations

```
Models/Types:
  lib/database/models/Notification.ts
  lib/notifications.ts

Helpers:
  lib/notificationHelpers.ts
  lib/useNotifications.ts

Components:
  components/notifications/NotificationBell.tsx
  components/notifications/NotificationCenter.tsx
  components/notifications/NotificationPreferencesModal.tsx
  components/notifications/Toast.tsx

Pages:
  app/notifications/page.tsx

Routes:
  app/api/notifications/
  app/api/notifications/[id]/
  app/api/notifications/unread/
  app/api/notifications/preferences/

Docs:
  NOTIFICATION_SYSTEM.md
  NOTIFICATION_INTEGRATION_GUIDE.md
  INTEGRATION_CHECKLIST.md
```

---

## ⚡ Common Tasks

### Mark as Read
```typescript
const { markAsRead } = useNotifications();
await markAsRead(notificationId);
```

### Mark All as Read
```typescript
const { markAllAsRead } = useNotifications();
await markAllAsRead();
```

### Delete Notification
```typescript
const { deleteNotification } = useNotifications();
await deleteNotification(notificationId);
```

### Fetch with Filter
```typescript
const { fetchNotifications } = useNotifications();
await fetchNotifications('unread'); // 'all' | 'unread' | 'read'
```

### Custom Notification
```typescript
const { createNotification } = useNotifications();
await createNotification(
  'booking_confirmed',
  'My Title',
  'My Message',
  { description: 'Details', priority: 'high' }
);
```

---

## 🔌 Integration Points

### Booking API
```typescript
// In app/api/bookings/create/route.ts
await notifyBookingConfirmed(userId, roomName, date, time, bookingId);
```

### Payment API
```typescript
// In app/api/commerce/callback/route.ts
await notifyPaymentReceived(userId, amount, txnId, orderId);
```

### Dashboard Page
```typescript
// In app/dashboard/page.tsx
const { unreadCount } = useNotifications();
const toast = useToast();
```

### Settings Modal
```typescript
// In components/dashboard/SettingsModal.tsx
<NotificationPreferencesModal isOpen={open} onClose={close} />
```

---

## 🧪 Testing Commands

### Test in Browser Console
```javascript
// Create a notification
fetch('/api/notifications', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'booking_confirmed',
    title: 'Test',
    message: 'Test message',
    priority: 'high'
  })
}).then(r => r.json()).then(console.log)
```

### Test API Endpoint
```bash
# Get notifications
curl http://localhost:3000/api/notifications

# Get unread count
curl http://localhost:3000/api/notifications/unread

# Get preferences
curl http://localhost:3000/api/notifications/preferences
```

---

## 🎯 Priority Levels

```
'low'     → Gray badge
'normal'  → Blue badge
'high'    → Orange badge
'urgent'  → Red badge
```

---

## 📱 UI Components

### NotificationBell
```tsx
<NotificationBell unreadCount={5} />
```

### Toast
```tsx
const toast = useToast();
toast.success('Title', 'Message');
```

### Preferences Modal
```tsx
<NotificationPreferencesModal 
  isOpen={true} 
  onClose={() => {}} 
/>
```

### Full Page
```tsx
// Navigate to /notifications
```

---

## 🔑 Key Features

✅ Type-safe TypeScript
✅ 12 notification types
✅ 4 priority levels
✅ Read/unread tracking
✅ Soft deletes
✅ Auto-expiration (30 days)
✅ User preferences
✅ Toast notifications
✅ Real-time bell badge
✅ Mobile responsive
✅ Fully documented
✅ Production ready

---

## ❌ Common Mistakes

❌ Forgetting to import helper
```typescript
// ❌ Wrong
await notifyBookingConfirmed(...)
// ✅ Right
import { notifyBookingConfirmed } from '@/lib/notificationHelpers';
await notifyBookingConfirmed(...)
```

❌ Not awaiting async call
```typescript
// ❌ Wrong
notifyBookingConfirmed(...)  // Fire and forget

// ✅ Right
await notifyBookingConfirmed(...)  // Wait for completion
```

❌ Missing ToastProvider in layout
```typescript
// ❌ Wrong - useToast() will throw error
// ✅ Right - Wrap in ToastProvider
<ToastProvider>{children}</ToastProvider>
```

---

## 📞 Need Help?

1. Check: `NOTIFICATION_SYSTEM.md` - Full reference
2. Examples: `NOTIFICATION_INTEGRATION_GUIDE.md` - Code samples
3. Checklist: `INTEGRATION_CHECKLIST.md` - Progress tracking
4. Template: `BOOKING_NOTIFICATION_EXAMPLE.ts` - Copy-paste

---

**Print this card and keep it handy! 🚀**

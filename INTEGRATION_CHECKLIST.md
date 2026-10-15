# Notification System Integration Checklist

Use this checklist to track your implementation progress.

## ✅ System Setup (Already Complete)

- [x] Database model created (`lib/database/models/Notification.ts`)
- [x] API routes created (`app/api/notifications/**`)
- [x] React hook created (`lib/useNotifications.ts`)
- [x] UI components created (`components/notifications/**`)
- [x] Toast provider added (`app/providers.tsx`)
- [x] Notification bell integrated in header
- [x] Full notifications page created (`app/notifications/page.tsx`)
- [x] Documentation created

---

## 🔄 Integration Tasks (To Do)

### Booking System Integration

- [ ] Open `app/api/bookings/create/route.ts`
- [ ] Import `notifyBookingConfirmed` from `lib/notificationHelpers`
- [ ] Add notification call after booking creation:
  ```typescript
  await notifyBookingConfirmed(
    userId,
    roomName,
    formattedDate,
    formattedTime,
    bookingId
  );
  ```
- [ ] Test: Create a booking and verify notification appears
- [ ] Test: Check notification center for the new notification
- [ ] Test: Verify unread badge appears on notification bell
- [ ] Test: Mark notification as read and verify badge updates

### Booking Cancellation

- [ ] Open `app/api/bookings/[id]/route.ts` (DELETE/PATCH endpoint)
- [ ] Import `notifyBookingCancelled` from `lib/notificationHelpers`
- [ ] Add notification when booking is cancelled:
  ```typescript
  await notifyBookingCancelled(
    userId,
    roomName,
    "User requested cancellation",
    bookingId
  );
  ```
- [ ] Test: Cancel a booking and verify notification appears

### Payment Integration

- [ ] Open `app/api/commerce/callback/route.ts`
- [ ] Import `notifyPaymentReceived` and `notifyPaymentFailed`
- [ ] Add for successful payment:
  ```typescript
  await notifyPaymentReceived(
    userId,
    `ZMW ${amount}`,
    transactionId,
    orderId
  );
  ```
- [ ] Add for failed payment:
  ```typescript
  await notifyPaymentFailed(
    userId,
    `ZMW ${amount}`,
    errorMessage,
    orderId
  );
  ```
- [ ] Test: Process a successful payment and verify notification
- [ ] Test: Trigger a failed payment and verify error notification

### User Preferences

- [ ] Navigate to notification preferences modal
- [ ] Toggle email notifications on/off
- [ ] Toggle SMS notifications on/off
- [ ] Toggle push notifications on/off
- [ ] Toggle weekly digest on/off
- [ ] Verify preferences persist after page reload
- [ ] Verify preferences update in MongoDB

### Dashboard Integration

- [ ] Open `app/dashboard/page.tsx`
- [ ] Import `useToast` from `components/notifications`
- [ ] Show toast when page loads if new notifications:
  ```typescript
  const toast = useToast();
  useEffect(() => {
    if (newNotifications.length > 0) {
      toast.info(title, message);
    }
  }, [notifications, toast]);
  ```
- [ ] Test: Create booking → go to dashboard → see toast
- [ ] Test: Go directly to notifications page
- [ ] Test: Verify all notifications show up

### Booking Reminder System (Optional but Recommended)

- [ ] Create `app/api/bookings/reminders/route.ts`
- [ ] Add logic to find bookings starting in 1-2 hours
- [ ] Import and call `notifyBookingReminder` for each
- [ ] Set up cron job to call this endpoint every 5 minutes:
  - Option 1: Vercel Cron Functions (if using Vercel)
  - Option 2: External service (AWS Lambda, cron-job.org)
  - Option 3: Scheduled task in your deployment
- [ ] Test manually: Create booking starting in 1-2 hours
- [ ] Test: Call `/api/bookings/reminders` endpoint manually
- [ ] Verify reminder notification appears

### Admin Announcements (Optional)

- [ ] Create `app/api/admin/announcements/route.ts`
- [ ] Add authentication check for admin role
- [ ] Implement sending notifications to all users
- [ ] Test: Create an announcement
- [ ] Verify all users receive the notification

---

## ✨ Testing Checklist

### Unit Tests
- [ ] Test `notifyBookingConfirmed` helper function
- [ ] Test `useNotifications` hook
- [ ] Test `markAsRead` functionality
- [ ] Test `formatNotificationTime` utility

### Integration Tests
- [ ] Create booking → notification appears
- [ ] Cancel booking → notification appears
- [ ] Mark as read → unread count decreases
- [ ] Delete notification → removed from list
- [ ] Mark all as read → all notifications updated
- [ ] Change preferences → verified in DB

### UI Tests
- [ ] Bell badge shows correct count
- [ ] Notification center dropdown opens/closes
- [ ] Filter tabs work (All/Unread/Read)
- [ ] Toast notifications appear and dismiss
- [ ] Preferences modal opens and saves
- [ ] Notifications page loads and displays
- [ ] Mobile responsive on all breakpoints

### Performance Tests
- [ ] Fetch 100 notifications → performance OK
- [ ] Unread count updates every 30 seconds
- [ ] No memory leaks (check DevTools)
- [ ] Page loads quickly with many notifications

### Browser Compatibility
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🐛 Troubleshooting

### Notifications Not Appearing?

- [ ] Check browser console for errors
- [ ] Verify user is logged in (`useSession()` works)
- [ ] Check Network tab - API calls should succeed
- [ ] Check MongoDB - new documents being created?
- [ ] Check provider.tsx has `ToastProvider` wrapping children

### Unread Count Not Updating?

- [ ] Wait 30 seconds for polling interval
- [ ] Manually refresh page
- [ ] Check `/api/notifications/unread` endpoint
- [ ] Verify `isRead` field in MongoDB

### Styles Not Applying?

- [ ] Ensure Tailwind CSS is configured
- [ ] Check `globals.css` has required imports
- [ ] Check `tailwind.config.ts` includes component files
- [ ] Clear browser cache and rebuild

### Database Errors?

- [ ] Check MongoDB connection string
- [ ] Verify `Notification` model is exported
- [ ] Check for schema validation errors
- [ ] Verify user exists before creating notification

---

## 📚 Documentation Reference

| Document | Purpose |
|----------|---------|
| `NOTIFICATION_SYSTEM.md` | Complete API & architecture reference |
| `NOTIFICATION_INTEGRATION_GUIDE.md` | Practical code examples |
| `BOOKING_NOTIFICATION_EXAMPLE.ts` | Template for integration |
| `IMPLEMENTATION_COMPLETE.md` | Overview of what was built |

---

## 📞 API Quick Reference

### Create Notification (Server)
```typescript
import { notifyBookingConfirmed } from '@/lib/notificationHelpers';
await notifyBookingConfirmed(userId, roomName, date, time, bookingId);
```

### Get Notifications (Client)
```typescript
const { notifications, unreadCount } = useNotifications();
```

### Show Toast (Client)
```typescript
const toast = useToast();
toast.success("Title", "Message");
```

### Mark as Read (Client)
```typescript
const { markAsRead } = useNotifications();
markAsRead(notificationId);
```

---

## 🎯 Timeline Suggestion

**Day 1**: Integration Tasks (Bookings, Payments)
**Day 2**: User Testing & Bug Fixes
**Day 3**: Optional Features (Reminders, Admin)
**Day 4**: Optimization & Performance

---

## ✅ Sign-Off Checklist

When all items are complete, the notification system is fully operational:

- [ ] All integration tasks completed
- [ ] All testing checklist items verified
- [ ] No errors in browser console
- [ ] No errors in server logs
- [ ] Notifications persist in MongoDB
- [ ] All user stories working
- [ ] Mobile responsive on all pages
- [ ] Documentation reviewed
- [ ] Team trained on usage
- [ ] Ready for production

---

## 📝 Notes

Use this space to track your progress and notes:

```
[Add your notes here]
```

---

**Last Updated**: 2024-09-15
**Status**: Ready for Integration

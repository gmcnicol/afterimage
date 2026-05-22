import { useUiStore } from '../../stores/ui-store';

export function NotificationCenter() {
  const notifications = useUiStore((state) => state.notifications);
  const removeNotification = useUiStore((state) => state.removeNotification);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="studio-notifications">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          className={`studio-notification tone-${notification.tone}`}
          onClick={() => removeNotification(notification.id)}
        >
          {notification.message}
        </button>
      ))}
    </div>
  );
}

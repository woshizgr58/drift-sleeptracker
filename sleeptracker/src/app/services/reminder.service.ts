import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

@Injectable({ providedIn: 'root' })
export class ReminderService {
  readonly native = Capacitor.isNativePlatform();
  readonly enabled = signal(false);
  readonly time = signal('14:00');
  readonly openCheckin = signal(0);
  constructor() {
    if (this.native) {
      void LocalNotifications.getPending()
        .then(({ notifications }) => {
          const reminder = notifications.find((n) => n.id === 48);
          this.enabled.set(!!reminder);
          if (reminder?.schedule?.on) {
            const { hour, minute } = reminder.schedule.on;
            this.time.set(
              `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            );
          }
        })
        .catch(() => undefined);
      void LocalNotifications.addListener(
        'localNotificationActionPerformed',
        () => {
          this.openCheckin.update((n) => n + 1);
        },
      );
    }
  }
  async schedule(time: string, test = false) {
    if (!this.native) {
      throw new Error(
        'Install Drift on Android or iOS to use device reminders.',
      );
    }
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') {
      throw new Error(
        'Notifications are disabled. Allow them in your device settings, then try again.',
      );
    }
    const [hour, minute] = time.split(':').map(Number);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: test ? 49 : 48,
          title: 'Sleepiness check-in',
          body: 'How awake do you feel? Log a check-in.',
          schedule: test
            ? { at: new Date(Date.now() + 10000) }
            : { on: { hour, minute }, repeats: true },
        },
      ],
    });
    if (!test) {
      this.enabled.set(true);
      this.time.set(time);
    }
  }
  async disable() {
    await LocalNotifications.cancel({
      notifications: [{ id: 48 }, { id: 49 }],
    });
    this.enabled.set(false);
  }
}

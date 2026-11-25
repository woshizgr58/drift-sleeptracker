import { Component, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonIcon,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonFooter,
  ToastController,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  moonOutline,
  sunnyOutline,
  homeOutline,
  timeOutline,
  optionsOutline,
  addOutline,
  arrowForwardOutline,
  checkmarkCircleOutline,
  closeOutline,
  cloudDownloadOutline,
  notificationsOutline,
  chevronForwardOutline,
  leafOutline,
  shareOutline,
} from 'ionicons/icons';
import {
  SleepService,
  SleepEntry,
  localDate,
  duration,
} from '../services/sleep.service';
import { ReminderService } from '../services/reminder.service';
import { StanfordSleepinessData } from '../data/stanford-sleepiness-data';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonFooter,
  ],
})
export class HomePage {
  tab = signal<'today' | 'journal' | 'settings'>('today');
  filter = signal('all');
  modal = signal<'night' | 'checkin' | null>(null);
  busy = signal(false);
  formError = signal('');
  editing: string | null = null;
  start = '';
  end = '';
  note = '';
  score = 3;
  goal = 8;
  reminderTime = '14:00';
  readonly scales = StanfordSleepinessData.ScaleValues.slice(1) as string[];
  readonly shortScales = [
    'Wide awake',
    'Functioning well',
    'Awake, relaxed',
    'A little foggy',
    'Slowing down',
    'Fighting sleep',
    'Sleep coming soon',
  ];
  readonly today = new Date();
  readonly maxDate = () => localDate(new Date());
  readonly duration = duration;
  readonly latest = computed(() => this.sleep.nights()[0]);
  readonly history = computed(() =>
    this.sleep
      .entries()
      .filter((e) => this.filter() === 'all' || e.kind === this.filter())
      .sort((a, b) => (b.end || b.start).localeCompare(a.end || a.start)),
  );
  readonly week = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - 6 + i);
      const key = localDate(day).slice(0, 10);
      const nights = this.sleep
        .nights()
        .filter((e) => localDate(new Date(e.end!)).slice(0, 10) === key);
      return {
        label: day
          .toLocaleDateString('en-US', { weekday: 'short' })
          .slice(0, 1),
        date: day.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        hours: nights.reduce((sum, e) => sum + duration(e), 0),
        hasData: nights.length > 0,
      };
    }),
  );
  readonly average = computed(() => {
    const days = this.week().filter((d) => d.hasData);
    return days.length
      ? days.reduce((sum, d) => sum + d.hours, 0) / days.length
      : 0;
  });
  readonly daysLogged = computed(
    () => this.week().filter((d) => d.hasData).length,
  );
  readonly preview = () =>
    this.start && this.end
      ? this.hours(
          (new Date(this.end).getTime() - new Date(this.start).getTime()) /
            3600000,
        )
      : '—';

  constructor(
    public sleep: SleepService,
    public reminders: ReminderService,
    private toasts: ToastController,
    private alerts: AlertController,
  ) {
    addIcons({
      moonOutline,
      sunnyOutline,
      homeOutline,
      timeOutline,
      optionsOutline,
      addOutline,
      arrowForwardOutline,
      checkmarkCircleOutline,
      closeOutline,
      cloudDownloadOutline,
      notificationsOutline,
      chevronForwardOutline,
      leafOutline,
      shareOutline,
    });
    effect(() => {
      if (this.reminders.openCheckin()) {
        this.open('checkin');
      }
    });
  }
  hours(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return '—';
    }
    const minutes = Math.round(value * 60);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }
  open(kind: 'night' | 'checkin', entry?: SleepEntry) {
    this.editing = entry?.id || null;
    const now = new Date();
    const bed = new Date(now);
    bed.setDate(bed.getDate() - 1);
    bed.setHours(23, 0, 0, 0);
    const wake = new Date(now);
    wake.setHours(7, 0, 0, 0);
    this.start = entry
      ? localDate(new Date(entry.start))
      : localDate(kind === 'night' ? bed : now);
    this.end = entry?.end
      ? localDate(new Date(entry.end))
      : localDate(wake > now ? now : wake);
    this.score = entry?.score || 3;
    this.note = entry?.note || '';
    this.formError.set('');
    this.modal.set(kind);
  }
  async save() {
    if (this.busy()) {
      return;
    }
    const kind = this.modal();
    if (!kind) {
      return;
    }
    const start = new Date(this.start),
      end = new Date(this.end),
      now = new Date();
    let error = '';
    if (!this.start || !Number.isFinite(start.getTime()) || start > now) {
      error = 'Choose a valid time that is not in the future.';
    } else if (kind === 'night') {
      const hours = (end.getTime() - start.getTime()) / 3600000;
      if (!this.end || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
        error = 'Wake-up must be after bedtime and within 24 hours.';
      } else if (end > now) {
        error = 'Wake-up cannot be in the future.';
      } else if (
        this.sleep
          .nights()
          .some(
            (e) =>
              e.id !== this.editing &&
              start < new Date(e.end!) &&
              end > new Date(e.start),
          )
      ) {
        error =
          'This overlaps a saved night. Edit that entry in your journal instead.';
      }
    }
    if (error) {
      this.formError.set(error);
      return;
    }
    this.busy.set(true);
    try {
      await this.sleep.save({
        id: this.editing || crypto.randomUUID(),
        kind,
        start: start.toISOString(),
        ...(kind === 'night'
          ? { end: end.toISOString() }
          : { score: this.score }),
        note: this.note.trim(),
      });
      this.busy.set(false);
      this.modal.set(null);
      await this.toast(
        this.editing
          ? 'Changes saved.'
          : kind === 'night'
            ? 'Sleep saved.'
            : 'Check-in saved.',
      );
    } catch {
      this.formError.set(
        'Could not save. Your entry is still here; please try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  async remove() {
    const entry = this.sleep.entries().find((e) => e.id === this.editing);
    if (!entry) {
      return;
    }
    const alert = await this.alerts.create({
      header: 'Delete this entry?',
      message: 'You can undo immediately after deleting.',
      buttons: [
        { text: 'Keep entry', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role === 'destructive') {
      await this.deleteConfirmed(entry);
    }
  }
  async deleteConfirmed(entry: SleepEntry) {
    this.busy.set(true);
    try {
      await this.sleep.remove(entry.id);
      this.busy.set(false);
      this.modal.set(null);
      const toast = await this.toasts.create({
        message: 'Entry deleted',
        duration: 8000,
        position: 'top',
        buttons: [
          {
            text: 'Undo',
            handler: () => {
              void this.sleep
                .save(entry)
                .catch(() => this.toast('Could not undo. Please try again.'));
            },
          },
        ],
      });
      await toast.present();
    } catch {
      this.formError.set('Could not delete. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
  async toast(message: string) {
    const toast = await this.toasts.create({
      message,
      duration: 3000,
      position: 'top',
    });
    await toast.present();
  }
  settings() {
    this.goal = this.sleep.goal();
    this.reminderTime = this.reminders.time();
    this.tab.set('settings');
  }
  async saveGoal() {
    this.busy.set(true);
    try {
      await this.sleep.commit(this.sleep.entries(), Number(this.goal));
      await this.toast('Sleep goal updated.');
    } catch {
      await this.toast('Could not save your goal. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
  async reminder(action: 'save' | 'test' | 'off') {
    this.busy.set(true);
    try {
      if (action === 'off') {
        await this.reminders.disable();
      } else {
        await this.reminders.schedule(this.reminderTime, action === 'test');
      }
      await this.toast(
        action === 'test'
          ? 'Reminder scheduled. Background the app; it arrives in about 10 seconds.'
          : action === 'off'
            ? 'Reminders turned off.'
            : 'Daily reminder scheduled.',
      );
    } catch (error) {
      await this.toast(
        error instanceof Error ? error.message : 'Could not update reminders.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  export() {
    const url = URL.createObjectURL(
      new Blob([this.sleep.backup()], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `drift-backup-${localDate(new Date()).slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async importBackup(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.busy.set(true);
    try {
      if (file.size > 10000000) {
        throw new Error('Choose a backup smaller than 10 MB.');
      }
      await this.sleep.restore(await file.text());
      await this.toast('Backup restored. Existing entries were kept.');
    } catch {
      await this.toast(
        'Could not restore this file. Choose a valid Drift JSON backup.',
      );
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }
}

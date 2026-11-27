import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { CloudJournalService } from './cloud-journal.service';
import { Preferences } from '@capacitor/preferences';

export interface SleepEntry {
  id: string;
  kind: 'night' | 'checkin';
  start: string;
  end?: string;
  score?: number;
  note: string;
}
interface Journal {
  version: 1;
  entries: SleepEntry[];
  goal: number;
}
export const localDate = (date: Date): string => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};
export const duration = (entry: SleepEntry): number =>
  (new Date(entry.end!).getTime() - new Date(entry.start).getTime()) / 3600000;

/** Validate persisted/imported data before it can replace the user's journal. */
export function validJournal(value: unknown): value is Journal {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const j = value as Journal;
  return (
    j.version === 1 &&
    Number.isFinite(j.goal) &&
    j.goal >= 4 &&
    j.goal <= 12 &&
    Array.isArray(j.entries) &&
    j.entries.length <= 20000 &&
    new Set(j.entries.map((e) => e?.id)).size === j.entries.length &&
    j.entries.every(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        typeof e.note === 'string' &&
        e.note.length <= 500 &&
        Number.isFinite(Date.parse(e.start)) &&
        (e.kind === 'night'
          ? Number.isFinite(Date.parse(e.end!)) &&
            duration(e) > 0 &&
            duration(e) <= 24
          : e.kind === 'checkin' &&
            Number.isInteger(e.score) &&
            e.score! >= 1 &&
            e.score! <= 7),
    )
  );
}

@Injectable({ providedIn: 'root' })
export class SleepService {
  private readonly key = 'drift.journal.v1';
  private generation = 0;
  private scope: string | null = null;
  readonly entries = signal<SleepEntry[]>([]);
  readonly goal = signal(8);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly writing = signal(false);
  readonly cloudMode = computed(() => !!this.auth.userId());
  readonly status = signal('Loading…');
  readonly deviceCount = signal(0);
  readonly nights = computed(() =>
    this.entries()
      .filter((e) => e.kind === 'night')
      .sort((a, b) => b.end!.localeCompare(a.end!)),
  );
  readonly checkins = computed(() =>
    this.entries()
      .filter((e) => e.kind === 'checkin')
      .sort((a, b) => b.start.localeCompare(a.start)),
  );

  constructor(
    public auth: AuthService,
    private cloud: CloudJournalService,
  ) {
    effect(() => {
      this.auth.userId();
      if (this.auth.initialized())
        untracked(() => {
          void this.load();
        });
    });
  }

  private async deviceJournal(): Promise<Journal> {
    const { value } = await Preferences.get({ key: this.key });
    if (!value) return { version: 1, entries: [], goal: 8 };
    const data: unknown = JSON.parse(value);
    if (!validJournal(data)) throw new Error('Invalid device journal');
    return data;
  }

  async load() {
    const userId = this.auth.userId();
    if (this.writing() && userId === this.scope) return;
    const generation = ++this.generation;
    if (userId !== this.scope) {
      // Clear the previous account's state before any asynchronous request.
      this.entries.set([]);
      this.goal.set(8);
      this.scope = userId;
    }
    this.ready.set(false);
    if (this.writing()) return;
    this.error.set('');
    this.status.set(userId ? 'Loading cloud journal…' : 'Loading…');
    try {
      const journal = userId
        ? await this.cloud.load(userId)
        : await this.deviceJournal();
      if (generation !== this.generation || userId !== this.auth.userId())
        return;
      this.entries.set(journal.entries);
      this.goal.set(journal.goal);
      this.ready.set(true);
      this.status.set(userId ? 'Saved to cloud' : 'Saved on this device');
    } catch {
      if (generation !== this.generation || userId !== this.auth.userId())
        return;
      this.status.set('Unable to load');
      this.error.set(
        userId
          ? 'Could not load your cloud journal. Check your connection and retry, or sign out to use your device journal.'
          : 'Your saved journal could not be loaded. No data was overwritten. Try reopening the app.',
      );
    }
    try {
      const local = await this.deviceJournal();
      if (generation === this.generation)
        this.deviceCount.set(local.entries.length);
    } catch {
      if (generation === this.generation) this.deviceCount.set(0);
    }
  }

  private async write(operation: (userId: string | null) => Promise<void>) {
    if (!this.ready() || this.writing())
      throw new Error('Journal is not ready.');
    const userId = this.auth.userId();
    this.writing.set(true);
    this.status.set(userId ? 'Saving to cloud…' : 'Saving…');
    try {
      await operation(userId);
      if (userId === this.auth.userId())
        this.status.set(userId ? 'Saved to cloud' : 'Saved on this device');
    } catch (error) {
      if (userId === this.auth.userId()) this.status.set('Save failed — retry');
      throw error;
    } finally {
      this.writing.set(false);
      if (userId !== this.auth.userId()) await this.load();
    }
  }

  // Persist first; a failed write never reports success or uploads the guest journal.
  private async persistDevice(entries: SleepEntry[], goal: number) {
    await Preferences.set({
      key: this.key,
      value: JSON.stringify({ version: 1, entries, goal }),
    });
  }

  async save(entry: SleepEntry) {
    if (!validJournal({ version: 1, entries: [entry], goal: this.goal() }))
      throw new Error('Invalid entry.');
    await this.write(async (userId) => {
      const exists = this.entries().some((e) => e.id === entry.id);
      const entries = [
        ...this.entries().filter((e) => e.id !== entry.id),
        entry,
      ];
      if (userId) await this.cloud.save(entry, exists);
      else await this.persistDevice(entries, this.goal());
      if (userId === this.auth.userId()) this.entries.set(entries);
    });
  }

  async remove(id: string) {
    await this.write(async (userId) => {
      const entry = this.entries().find((e) => e.id === id);
      if (!entry) return;
      const entries = this.entries().filter((e) => e.id !== id);
      if (userId) await this.cloud.remove(entry);
      else await this.persistDevice(entries, this.goal());
      if (userId === this.auth.userId()) this.entries.set(entries);
    });
  }

  async saveGoal(goal: number) {
    if (!Number.isFinite(goal) || goal < 4 || goal > 12)
      throw new Error('Invalid goal.');
    await this.write(async (userId) => {
      if (userId) await this.cloud.saveGoal(userId, goal);
      else await this.persistDevice(this.entries(), goal);
      if (userId === this.auth.userId()) this.goal.set(goal);
    });
  }

  async restore(text: string) {
    const data: unknown = JSON.parse(text);
    if (!validJournal(data))
      throw new Error('This file is not a valid Drift backup.');
    await this.write(async (userId) => {
      const existing = new Set(this.entries().map((e) => e.id));
      const missing = data.entries.filter((e) => !existing.has(e.id));
      if (userId) {
        // Record each acknowledged upload. Retrying a partial import skips those IDs.
        for (const entry of missing) {
          if (userId !== this.auth.userId())
            throw new Error('Account changed.');
          await this.cloud.save(entry, false);
          if (userId === this.auth.userId())
            this.entries.update((entries) => [...entries, entry]);
        }
      } else {
        const entries = [...this.entries(), ...missing];
        await this.persistDevice(entries, this.goal());
        if (!this.auth.userId()) this.entries.set(entries);
      }
    });
  }

  async importDevice() {
    if (!this.auth.userId()) throw new Error('Sign in first.');
    const userId = this.auth.userId();
    const local = await this.deviceJournal();
    if (userId !== this.auth.userId()) throw new Error('Account changed.');
    await this.restore(JSON.stringify(local));
  }

  backup() {
    return JSON.stringify(
      { version: 1, entries: this.entries(), goal: this.goal() },
      null,
      2,
    );
  }
}

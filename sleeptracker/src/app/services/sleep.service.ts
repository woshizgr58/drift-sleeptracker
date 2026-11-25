import { Injectable, computed, signal } from '@angular/core';
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
  readonly entries = signal<SleepEntry[]>([]);
  readonly goal = signal(8);
  readonly ready = signal(false);
  readonly error = signal('');
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

  constructor() {
    void this.load();
  }

  async load() {
    try {
      const { value } = await Preferences.get({ key: this.key });
      if (value) {
        const data: unknown = JSON.parse(value);
        if (!validJournal(data)) {
          throw new Error('Invalid journal');
        }
        this.entries.set(data.entries);
        this.goal.set(data.goal);
      }
      this.error.set('');
      this.ready.set(true);
    } catch {
      this.error.set(
        'Your saved journal could not be loaded. No data was overwritten. Try reopening the app.',
      );
    }
  }

  // Persist first: a failed write must never look like a successful save.
  async commit(entries: SleepEntry[], goal = this.goal()) {
    if (!this.ready()) {
      throw new Error('Journal is not ready.');
    }
    await Preferences.set({
      key: this.key,
      value: JSON.stringify({ version: 1, entries, goal }),
    });
    this.entries.set(entries);
    this.goal.set(goal);
  }

  async save(entry: SleepEntry) {
    await this.commit([
      ...this.entries().filter((e) => e.id !== entry.id),
      entry,
    ]);
  }
  async remove(id: string) {
    await this.commit(this.entries().filter((e) => e.id !== id));
  }
  async restore(text: string) {
    const data: unknown = JSON.parse(text);
    if (!validJournal(data)) {
      throw new Error('This file is not a valid Drift backup.');
    }
    // Merge by ID so restoring does not erase unrelated entries.
    const merged = new Map(this.entries().map((e) => [e.id, e]));
    for (const entry of data.entries) {
      if (!merged.has(entry.id)) {
        merged.set(entry.id, entry);
      }
    }
    await this.commit([...merged.values()]);
  }
  backup() {
    return JSON.stringify(
      { version: 1, entries: this.entries(), goal: this.goal() },
      null,
      2,
    );
  }
}

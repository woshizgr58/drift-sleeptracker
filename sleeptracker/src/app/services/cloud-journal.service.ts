import { Injectable } from '@angular/core';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import type { SleepEntry } from './sleep.service';

interface Result<T> {
  data: T;
  errors?: readonly { message: string }[];
}
function checked<T>(result: Result<T>): T {
  if (result.errors?.length)
    throw new Error(result.errors.map((e) => e.message).join('; '));
  return result.data;
}

@Injectable({ providedIn: 'root' })
export class CloudJournalService {
  // Lazy creation also lets a fresh checkout run without an AWS backend.
  private client?: ReturnType<typeof generateClient<Schema>>;
  private get models() {
    this.client ??= generateClient<Schema>({ authMode: 'userPool' });
    return this.client.models;
  }

  async load(userId: string) {
    const nights: SleepEntry[] = [];
    const checkins: SleepEntry[] = [];
    let nextToken: string | null | undefined;
    do {
      const result = await this.models.OvernightSleep.list({
        limit: 100,
        nextToken,
      });
      nights.push(
        ...checked(result).map((e) => ({
          id: e.id,
          kind: 'night' as const,
          start: e.start,
          end: e.end,
          note: e.note || '',
        })),
      );
      nextToken = result.nextToken;
    } while (nextToken);
    do {
      const result = await this.models.SleepinessCheckin.list({
        limit: 100,
        nextToken,
      });
      checkins.push(
        ...checked(result).map((e) => ({
          id: e.id,
          kind: 'checkin' as const,
          start: e.start,
          score: e.score,
          note: e.note || '',
        })),
      );
      nextToken = result.nextToken;
    } while (nextToken);
    const settings = checked(
      await this.models.SleepSettings.get({ id: userId }),
    );
    return { entries: [...nights, ...checkins], goal: settings?.goal ?? 8 };
  }

  async save(entry: SleepEntry, exists: boolean) {
    if (entry.kind === 'night') {
      const input = {
        id: entry.id,
        start: entry.start,
        end: entry.end!,
        note: entry.note,
      };
      const result = exists
        ? await this.models.OvernightSleep.update(input)
        : await this.models.OvernightSleep.create(input);
      if (!checked(result))
        throw new Error('The night could not be saved. Refresh your journal.');
    } else {
      const input = {
        id: entry.id,
        start: entry.start,
        score: entry.score!,
        note: entry.note,
      };
      const result = exists
        ? await this.models.SleepinessCheckin.update(input)
        : await this.models.SleepinessCheckin.create(input);
      if (!checked(result))
        throw new Error(
          'The check-in could not be saved. Refresh your journal.',
        );
    }
  }

  async remove(entry: SleepEntry) {
    if (entry.kind === 'night')
      checked(await this.models.OvernightSleep.delete({ id: entry.id }));
    else checked(await this.models.SleepinessCheckin.delete({ id: entry.id }));
  }

  async saveGoal(userId: string, goal: number) {
    const current = checked(
      await this.models.SleepSettings.get({ id: userId }),
    );
    const result = current
      ? await this.models.SleepSettings.update({ id: userId, goal })
      : await this.models.SleepSettings.create({ id: userId, goal });
    if (!checked(result)) throw new Error('The goal could not be saved.');
  }
}

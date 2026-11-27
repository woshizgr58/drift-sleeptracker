import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { AuthService } from './auth.service';
import { CloudJournalService } from './cloud-journal.service';
import { SleepService, SleepEntry } from './sleep.service';

const entry: SleepEntry = {
  id: 'local-night',
  kind: 'night',
  start: '2026-01-01T23:00:00.000Z',
  end: '2026-01-02T07:00:00.000Z',
  note: 'Device entry',
};

describe('SleepService account storage', () => {
  let service: SleepService;
  let auth: {
    userId: ReturnType<typeof signal<string | null>>;
    initialized: ReturnType<typeof signal<boolean>>;
  };
  let cloud: jasmine.SpyObj<CloudJournalService>;
  let deviceWrite: jasmine.Spy;
  beforeEach(async () => {
    auth = { userId: signal<string | null>(null), initialized: signal(false) };
    cloud = jasmine.createSpyObj('CloudJournalService', [
      'load',
      'save',
      'remove',
      'saveGoal',
    ]);
    cloud.load.and.resolveTo({ entries: [], goal: 8 });
    cloud.save.and.resolveTo();
    cloud.remove.and.resolveTo();
    cloud.saveGoal.and.resolveTo();
    await Preferences.set({
      key: 'drift.journal.v1',
      value: JSON.stringify({ version: 1, entries: [entry], goal: 8 }),
    });
    deviceWrite = spyOn(Storage.prototype, 'setItem').and.callThrough();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: CloudJournalService, useValue: cloud },
      ],
    });
    service = TestBed.inject(SleepService);
  });

  afterEach(async () => {
    await Preferences.remove({ key: 'drift.journal.v1' });
  });

  it('keeps device entries local until an explicit import', async () => {
    await service.load();
    expect(service.entries()).toEqual([entry]);
    auth.userId.set('account-a');
    await service.load();
    expect(service.entries()).toEqual([]);
    expect(cloud.save).not.toHaveBeenCalled();
    await service.importDevice();
    expect(cloud.save).toHaveBeenCalledWith(entry, false);
    expect(service.entries()).toEqual([entry]);
    expect(deviceWrite).not.toHaveBeenCalled();
  });

  it('does not report a failed cloud save as successful', async () => {
    auth.userId.set('account-a');
    await service.load();
    cloud.save.and.rejectWith(new Error('Network unavailable'));
    await expectAsync(service.save(entry)).toBeRejected();
    expect(service.entries()).toEqual([]);
    expect(service.status()).toBe('Save failed — retry');
    expect(deviceWrite).not.toHaveBeenCalled();
  });

  it('restores the device journal after signing out', async () => {
    auth.userId.set('account-a');
    cloud.load.and.resolveTo({
      entries: [{ ...entry, id: 'cloud-night' }],
      goal: 9,
    });
    await service.load();
    auth.userId.set(null);
    await service.load();
    expect(service.entries()).toEqual([entry]);
    expect(service.goal()).toBe(8);
    expect(deviceWrite).not.toHaveBeenCalled();
  });

  it('discards a response from a previous account', async () => {
    let finish!: (value: { entries: SleepEntry[]; goal: number }) => void;
    auth.userId.set('account-a');
    cloud.load.and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const oldLoad = service.load();
    auth.userId.set(null);
    await service.load();
    finish({
      entries: [{ ...entry, id: 'private-account-a-entry' }],
      goal: 10,
    });
    await oldLoad;
    expect(service.entries()).toEqual([entry]);
    expect(service.goal()).toBe(8);
  });

  it('retains acknowledged uploads after a partial import and skips them on retry', async () => {
    auth.userId.set('account-a');
    await service.load();
    const second = { ...entry, id: 'second-night' };
    const backup = JSON.stringify({
      version: 1,
      entries: [entry, second],
      goal: 8,
    });
    cloud.save.and.callFake(async (value) => {
      if (value.id === second.id) throw new Error('Offline');
    });
    await expectAsync(service.restore(backup)).toBeRejected();
    expect(service.entries()).toEqual([entry]);
    cloud.save.calls.reset();
    cloud.save.and.resolveTo();
    await service.restore(backup);
    expect(cloud.save).toHaveBeenCalledOnceWith(second, false);
    expect(service.entries()).toEqual([entry, second]);
  });
});

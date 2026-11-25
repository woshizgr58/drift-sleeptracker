import { OvernightSleepData } from './overnight-sleep-data';

describe('OvernightSleepData', () => {
  it('should create an instance', () => {
    expect(
      new OvernightSleepData(new Date(2026, 0, 1, 23), new Date(2026, 0, 2, 7)),
    ).toBeTruthy();
  });
});

import Statsig from '../index';
import { StatsigUser } from '../index';
import { parseLogEvents } from './StatsigTestUtils';

jest.mock('node-fetch', () => jest.fn());

const clearStatsig = () => {
  const instance = require('../StatsigInstanceUtils').default.getInstance();
  if (instance) {
    instance.shutdown();
    require('../StatsigInstanceUtils').default.setInstance(null);
  }
};

describe('Statsig flush() method with timeout', () => {
  let logs: { eventName: string; metadata?: { gate?: string; config?: string } }[] = [];
  const user: StatsigUser = { userID: 'a-user' };

  beforeEach(() => {
    logs = [];
    const fetch = require('node-fetch');
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('log_event')) {
        logs.push(...parseLogEvents(params)['events']);
        return Promise.resolve({
          ok: false,
          status: 500,
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });
    clearStatsig();
  });

  it('does not retry on failure', async () => {
    await Statsig.initialize('secret-key', { disableDiagnostics: true });
    Statsig.logEvent(user, 'test-event');
    await Statsig.flush(3000);
    expect(logs).toHaveLength(1);
  });

  it('cancels if exceeds timeout', async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('log_event')) {
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 2000));
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });

    await Statsig.initialize('secret-key', { disableDiagnostics: true });
    Statsig.logEvent(user, 'test-event');
    const flushPromise = Statsig.flush(1000);
    await expect(flushPromise).resolves.toBeUndefined(); 
    expect(logs).toHaveLength(0);
  });
});

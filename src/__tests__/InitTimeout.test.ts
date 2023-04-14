import * as statsigsdk from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
// @ts-ignore
const statsig = statsigsdk.default;

const exampleConfigSpecs = require('./jest.setup');

jest.mock('node-fetch', () => jest.fn());
// @ts-ignore
const fetch = require('node-fetch');

const jsonResponse = {
  time: Date.now(),
  feature_gates: [exampleConfigSpecs.gate, exampleConfigSpecs.disabled_gate],
  dynamic_configs: [exampleConfigSpecs.config],
  layer_configs: [],
  id_lists: {},
  has_updates: true,
};

let events: {
  eventName: string;
  metadata: { gate?: string; config?: string; isManualExposure?: string };
}[] = [];

// @ts-ignore
fetch.mockImplementation((url, params) => {
  if (url.includes('log_event')) {
    events = events.concat(JSON.parse(params.body)['events']);
    return Promise.resolve({
      ok: true,
    });
  }
  if (url.includes('download_config_specs')) {
    return new Promise((res) => {
      setTimeout(
        () =>
          res({
            ok: true,
            json: () => Promise.resolve(jsonResponse),
            text: () => Promise.resolve(JSON.stringify(jsonResponse)),
          }),
        1000,
      );
    });
  }
  return Promise.reject();
});

describe('Test local mode with overrides', () => {
  jest.setTimeout(3000);

  jest.useFakeTimers();

  beforeEach(() => {
    events = [];

    let now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
    jest.resetModules();
    jest.restoreAllMocks();

    StatsigInstanceUtils.setInstance(null);
  });

  test('Verify initialize() returns early when the network request takes too long', async () => {
    const prom = statsig.initialize('secret-abcdefg1234567890', {
      initTimeoutMs: 250,
    });
    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 200);
    jest.advanceTimersByTime(200);
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 400);
    jest.advanceTimersByTime(200);

    await prom;
    // @ts-ignore
    expect(StatsigInstanceUtils.getInstance()['_ready']).toBe(true);
    expect(prom).resolves;
    expect(
      statsig.checkGate(
        { userID: 'test_user_id', email: 'test@nfl.com' },
        'nfl_gate',
      ),
    ).resolves.toBe(false);

    statsig.shutdown();
    expect(events).toHaveLength(2); // 1 for init, 1 for gate check
    const markers = events.find(e => e.eventName === 'statsig::diagnostics')?.['metadata']['markers'];
    expect(markers).toHaveLength(3);
    expect(markers[2]['action']).toBe('timeout');
    expect(markers[2]['value']).toBe(250);
  });

  test('Verify initialize() can resolve before the specified timeout and serve requests', async () => {
    const prom = statsig.initialize('secret-abcdefg1234567890', {
      initTimeoutMs: 3000,
    });
    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 1200);
    jest.advanceTimersByTime(1200);
    await prom;
    // @ts-ignore
    expect(StatsigInstanceUtils.getInstance()['_ready']).toBe(true);
    expect(
      statsig.checkGate(
        { userID: 'test_user_id', email: 'test@nfl.com' },
        'nfl_gate',
      ),
    ).resolves.toBe(true);
  });
});

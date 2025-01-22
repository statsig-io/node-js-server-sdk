import * as statsigsdk from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { getDecodedBody } from './StatsigTestUtils';
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
    events = events.concat(getDecodedBody(params)['events']);
    return Promise.resolve({
      ok: true,
    });
  }
  if (url.includes('download_config_specs')) {
    return new Promise((res) => {
      // Simulate a 1s delay
      jest.advanceTimersByTime(1000);
      res({
        ok: true,
        json: () => Promise.resolve(jsonResponse),
        text: () => Promise.resolve(JSON.stringify(jsonResponse)),
      });
    });
  }
  return Promise.reject();
});

describe('Test local mode with overrides', () => {
  jest.setTimeout(3000);

  jest.useFakeTimers();

  beforeEach(() => {
    events = [];

    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
    jest.resetModules();
    jest.restoreAllMocks();

    StatsigInstanceUtils.setInstance(null);
  });

  test('Verify initialize() returns early when the network request takes too long', async () => {
    const prom = statsig.initialize('secret-abcdefg1234567890', {
      initTimeoutMs: 250,
    });
    jest.advanceTimersByTime(400);

    await prom;
    // @ts-ignore
    expect(StatsigInstanceUtils.getInstance()['_ready']).toBe(true);
    expect(prom).resolves;
    expect(
      statsig.checkGate(
        { userID: 'test_user_id', email: 'test@nfl.com' },
        'nfl_gate',
      ),
    ).toBe(false);

    await statsig.shutdownAsync();
    expect(events).toHaveLength(2); // 1 for init and 1 for gate check
    const event = events.find((e) => e.eventName === 'statsig::diagnostics');
    expect(event?.metadata['statsigOptions']['initTimeoutMs']).toBe(250);

    const endMarker = event?.metadata['markers'].find(
      (marker) => marker.action === 'end',
    );
    expect(endMarker['action']).toBe('end');
    expect(endMarker['success']).toBe(false);
    expect(endMarker['reason']).toStrictEqual('timeout');
  });

  test('Verify initialize() can resolve before the specified timeout and serve requests', async () => {
    const prom = statsig.initialize('secret-abcdefg1234567890', {
      initTimeoutMs: 3000,
      disableDiagnostics: true,
    });
    await prom;
    // @ts-ignore
    expect(StatsigInstanceUtils.getInstance()['_ready']).toBe(true);
    expect(
      statsig.checkGate(
        { userID: 'test_user_id', email: 'test@nfl.com' },
        'nfl_gate',
      ),
    ).toBe(true);
  });
});

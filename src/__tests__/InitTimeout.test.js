const timeoutMs = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  }).then((_) => {
    return TIMED_OUT;
  });

const TIMED_OUT = Symbol();

describe('Test local mode with overrides', () => {
  jest.setTimeout(3000);
  const exampleConfigSpecs = require('./jest.setup');
  jest.useFakeTimers();

  let fetch;

  beforeEach(() => {
    let now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
    jest.resetModules();
    jest.restoreAllMocks();

    fetch = require('node-fetch');
    jest.mock('node-fetch', () => jest.fn());

    const jsonResponse = {
      time: Date.now(),
      feature_gates: [
        exampleConfigSpecs.gate,
        exampleConfigSpecs.disabled_gate,
      ],
      dynamic_configs: [exampleConfigSpecs.config],
      id_lists: {},
      has_updates: true,
    };
    fetch.mockImplementation((url) => {
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
  });

  test('Verify initialize() returns early when the network request takes too long', async () => {
    const statsig = require('../index');
    const prom = statsig.initialize('secret-abcdefg1234567890', {
      initTimeoutMs: 250,
    });
    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 200);
    jest.advanceTimersByTime(200);
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 400);
    jest.advanceTimersByTime(200);

    await prom;
    expect(statsig._ready).toBeTruthy();
    expect(prom).resolves.toBe(undefined);
    expect(
      statsig.checkGate(
        { userID: 'test_user_id', email: 'test@nfl.com' },
        'nfl_gate',
      ),
    ).resolves.toBe(false);
  });

  test('Verify initialize() can resolve before the specified timeout and serve requests', async () => {
    const statsig = require('../index');
    const prom = statsig.initialize('secret-abcdefg1234567890', {
      initTimeoutMs: 3000,
    });
    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 1200);
    jest.advanceTimersByTime(1200);
    await prom;
    expect(statsig._ready).toBeTruthy();
    expect(
      statsig.checkGate(
        { userID: 'test_user_id', email: 'test@nfl.com' },
        'nfl_gate',
      ),
    ).resolves.toBe(true);
  });
});

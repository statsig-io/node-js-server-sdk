const StatsigFetcher = require('../StatsigFetcher');
const fetch = require('node-fetch');
jest.mock('node-fetch', () => jest.fn());

describe('Verify behavior of top level index functions', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();

    let calls = 0;
    fetch.mockImplementation((_url) => {
      calls++;
      if (calls == 1) {
        return Promise.reject();
      } else if (calls == 2) {
        return Promise.resolve({
          ok: true,
          status: 500,
          json: () =>
            Promise.resolve({
              name: 'gate_server',
              value: true,
              rule_id: 'rule_id_gate_server',
            }),
        });
      } else {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              value: true,
            }),
        });
      }
    });
  });

  test('Test retries', async () => {
    const spy = jest.spyOn(StatsigFetcher, 'post');
    const result = await StatsigFetcher.post(
      'http://api.statsig.com/v1/test',
      'test-123',
      { test: 123 },
      5,
      10,
    );
    expect(spy).toHaveBeenCalledTimes(3);
    const json = await result.json();
    expect(json).toEqual({ value: true });
  });
});

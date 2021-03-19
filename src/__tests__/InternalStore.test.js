describe('Verify behavior of InternalStore', () => {
  const { DynamicConfig } = require('../DynamicConfig');
  const fetch = require('node-fetch');
  const hash = require('object-hash');
  const statsig = require('../index');
  const secretKey = 'secretKey';

  jest.mock('node-fetch');

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('Verify top level function initializes instance variables.', async () => {
    fetch.mockReturnValueOnce(Promise.resolve());

    await statsig.initialize(secretKey);
    const store = statsig.store;
    expect(store.cache).toBeDefined();
    expect(store.pendingPromises).toBeDefined();
    expect(store.checkGate).toBeInstanceOf(Function);
    expect(store.getConfig).toBeInstanceOf(Function);
  });

  test('Verify checkGate rejects when gateName is not valid.', async () => {
    expect.assertions(7);

    const store = statsig.store;
    await store
      .checkGate({ userID: 123 })
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
    await store
      .checkGate({ userID: 123 }, null)
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
    await store
      .checkGate({ userID: 123 }, undefined)
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
    await store
      .checkGate({ userID: 123 }, '')
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
    await store
      .checkGate({ userID: 123 }, 456)
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
    await store
      .checkGate({ userID: 123 }, false)
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
    await store
      .checkGate({ userID: 123 }, {})
      .catch((e) =>
        expect(e.message).toMatch('gateName must be a valid string.')
      );
  });

  test('Verify checkGate and getConfig return correct value when cache miss.', async () => {
    expect.assertions(10);

    const store = statsig.store;
    let mockFetchPromise = Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          gates: { gate1: false, gate2: true },
          configs: {
            config1: {
              value: { bool: true },
              group: 'default',
            },
          },
        }),
    });
    fetch.mockReturnValueOnce(mockFetchPromise);
    await store.checkGate({ userID: 123 }, 'gate1').then((data) => {
      expect(data).toBe(false);
    });
    await store.checkGate({ userID: 123 }, 'gate2').then((data) => {
      expect(data).toBe(true);
    });
    await store.getConfig({ userID: 123 }, 'config1').then((data) => {
      expect(data.name).toBe('config1');
      expect(data.getBool('bool')).toBe(true);
      expect(data.getBool('bool2')).toBe(false);
    });
    await store.getConfig({ userID: 123 }, 'config2').then((data) => {
      expect(data.name).toBe('config2');
      expect(data.getBool('bool')).toBe(false);
      expect(data.getNumber('num')).toBe(0);
      expect(data.getString('str')).toBe('');
      expect(data.getObject('obj').getRawValue()).toEqual({});
    });
  });

  test('Verify checkGate and getConfig return correct value when cache hits.', async () => {
    expect.assertions(11);

    const store = statsig.store;
    const hashKey = hash({ userID: 123 });
    store.cache = {};
    store.cache[hashKey] = {
      gates: { gate1: false, gate2: true },
      configs: {
        config1: new DynamicConfig('config1', { bool: true }, 'default'),
      },
    };
    // cache is set by the test above with fetch mock return value
    await store.checkGate({ userID: 123 }, 'gate1').then((data) => {
      expect(data).toBe(false);
    });
    await store.checkGate({ userID: 123 }, 'gate2').then((data) => {
      expect(data).toBe(true);
    });
    await store.checkGate({ userID: 123 }, 'gate3').then((data) => {
      expect(data).toBe(false);
    });
    await store.getConfig({ userID: 123 }, 'config1').then((data) => {
      expect(data.name).toBe('config1');
      expect(data.getBool('bool')).toBe(true);
      expect(data.getBool('bool2')).toBe(false);
    });
    await store.getConfig({ userID: 123 }, 'config2').then((data) => {
      expect(data.name).toBe('config2');
      expect(data.getBool('bool')).toBe(false);
      expect(data.getNumber('num')).toBe(0);
      expect(data.getString('str')).toBe('');
      expect(data.getObject('obj').getRawValue()).toEqual({});
    });
  });
});

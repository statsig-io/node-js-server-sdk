describe('Verify behavior of top level index functions', () => {
  const LogEvent = require('../LogEvent');
  const fetch = require('node-fetch');
  jest.mock('node-fetch', () => jest.fn());
  const secretKey = 'secret-key';
  const str_64 =
    '1234567890123456789012345678901234567890123456789012345678901234';

  beforeEach(() => {
    jest.restoreAllMocks();
    fetch.mockImplementation((url) => {
      if (url.includes('initialize')) {
        return Promise.resolve({});
      } else if (url.includes('check_gate')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: 'gate1',
              value: true,
            }),
        });
      } else if (url.includes('get_config')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: 'config1',
              value: {
                string: '123',
                number: 12,
              },
              group: 'default',
            }),
        });
      }
      return Promise.reject();
    });
  });

  test('Verify initialize() returns an error when a secret key is not provided', async () => {
    const statsig = require('../index');
    // @ts-ignore intentionally testing incorrect param type
    return expect(statsig.initialize()).rejects.toEqual(
      new Error(
        'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk'
      )
    );
  });

  test('Verify initialize() returns an error when an empty secret key is provided', async () => {
    const statsig = require('../index');
    return expect(statsig.initialize('')).rejects.toEqual(
      new Error(
        'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk'
      )
    );
  });

  test('Verify initialize() returns an error when a client key is provided', async () => {
    const statsig = require('../index');
    return expect(
      statsig.initialize('client-abcdefg1234567890')
    ).rejects.toEqual(
      new Error(
        'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk'
      )
    );
  });

  test('Verify logEvent() does not log before initialize()', () => {
    const statsig = require('../index');
    expect.assertions(1);
    statsig.logEvent({ userID: '12345' }, 'my_event');
    expect(statsig._logger).toBe(undefined);
  });

  test('Verify cannot call checkGate() before initialize()', () => {
    const statsig = require('../index');
    expect.assertions(1);
    return expect(
      statsig.checkGate({ userID: '12345' }, 'my_gate')
    ).rejects.toEqual(new Error('Must call initialize() first.'));
  });

  test('Verify cannot call getConfig() before initialize()', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig
      .getConfig({ userID: '12345' }, 'my_config')
      .catch((e) => expect(e.message).toMatch('Must call initialize() first.'));
  });

  test('Verify multiple initialize calls resolve', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      expect(statsig.initialize(secretKey)).resolves.not.toThrow();
    });
  });

  test('Verify internal components are initialized properly after initialize() is called with a secret Key', async () => {
    const statsig = require('../index');
    expect.assertions(4);
    return statsig.initialize(secretKey).then(() => {
      expect(statsig._secretKey).toBe(secretKey);
      expect(statsig._logger).toBeDefined();
      expect(statsig._options.api).toBe('https://api.statsig.com/v1');
      expect(statsig._ready).toBe(true);
    });
  });

  test('Verify cannot call checkGate() with no gate name', () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.checkGate(null)).rejects.toEqual(
        new Error('Must pass a valid gateName to check')
      );
    });
  });

  test('Verify cannot call checkGate() with invalid gate name', () => {
    const statsig = require('../index');
    expect.assertions(1);

    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.checkGate({}, 12)).rejects.toEqual(
        new Error('Must pass a valid gateName to check')
      );
    });
  });

  test('Verify cannot call getConfig() with no config name', () => {
    const statsig = require('../index');
    expect.assertions(1);

    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.getConfig({})).rejects.toEqual(
        new Error('Must pass a valid configName to check')
      );
    });
  });

  test('Verify cannot call getConfig() with invalid config name', () => {
    const statsig = require('../index');
    expect.assertions(1);

    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.getConfig({}, false)).rejects.toEqual(
        new Error('Must pass a valid configName to check')
      );
    });
  });

  test('Verify checkGate returns correct value', async () => {
    expect.assertions(1);

    const statsig = require('../index');
    await statsig.initialize(secretKey);
    return expect(
      statsig.checkGate({ userID: 123 }, 'gate1')
    ).resolves.toStrictEqual(true);
  });

  test('Verify getConfig returns correct value', async () => {
    expect.assertions(2);

    const statsig = require('../index');
    await statsig.initialize(secretKey);
    await statsig.getConfig({ userID: 123 }, 'config1').then((data) => {
      expect(data.getValue('number')).toStrictEqual(12);
      expect(data.getValue('string')).toStrictEqual('123');
    });
  });

  test('Verify logEvent() does not log if eventName is null', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEvent({ userID: '12345' }, null);
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent() does not log if eventName is empty string', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEvent({ userID: '12345' }, '');
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent() does not log if eventName is an object', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      // @ts-ignore intentionally testing incorrect param type
      statsig.logEvent({ userID: '12345' }, { name: 'event' });
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify Event is logged without user', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEvent(null, 'event', 1, { price: '2' });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify Event is logged', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEvent({ userID: '12345' }, 'event', 1, { price: '2' });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify Event is logged', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEvent({ userID: 12345 }, 'event', 1, { price: '2' });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify big user object and log event are getting trimmed', async () => {
    const statsig = require('../index');

    expect.assertions(2);
    let str_1k = str_64;
    // create a 1k long string
    for (let i = 0; i < 4; i++) {
      str_1k += str_1k;
    }
    expect(str_1k.length).toBe(1024);
    return statsig.initialize(secretKey).then(() => {
      let bigUser = {
        userID: str_64 + 'more',
        email: 'jest@statsig.com',
        custom: { extradata: str_1k },
      };
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEvent(bigUser, str_64 + 'extra', str_64 + 'extra', {
        extradata: str_1k,
      });

      const trimmedEvent = new LogEvent(str_64.substring(0, 64));
      trimmedEvent.setUser({
        userID: str_64,
        email: 'jest@statsig.com',
        custom: {},
      });
      trimmedEvent.setValue(str_64.substring(0, 64));
      trimmedEvent.setMetadata({ error: 'not logged due to size too large' });
      expect(spy).toBeCalledWith(trimmedEvent);
    });
  });

  test('Verify shutdown makes the SDK not ready', async () => {
    const statsig = require('../index');
    expect.assertions(2);
    fetch.mockImplementation(() => Promise.resolve({}));
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'flush');
      statsig.shutdown();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(statsig.isReady()).toStrictEqual(false);
    });
  });
});

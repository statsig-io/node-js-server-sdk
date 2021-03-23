const LogEvent = require('../LogEvent');

describe('Verify behavior of top level index functions', () => {
  const secretKey = 'secret-key';
  const str_64 =
    '1234567890123456789012345678901234567890123456789012345678901234';

  jest.mock('../InternalStore', (_secretKey, _logger) => {
    return jest.fn().mockImplementation(() => {
      return {
        checkGate: (user, gateName) => {
          if (gateName === 'valid_gate') return Promise.resolve(true);
          if (gateName === 'should_throw')
            return Promise.reject(new Error('should throw'));
          return Promise.resolve(false);
        },
        getConfig: (user, configName) => {
          if (configName == null) {
            return Promise.reject(
              new Error('configName is not a valid string.')
            );
          }
          const { DynamicConfig } = require('../DynamicConfig');
          return Promise.resolve(new DynamicConfig(configName, {}, 'default'));
        },
        save: () => {},
      };
    });
  });

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
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

  test('Verify multiple initialize calls resolve', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      expect(statsig.initialize(secretKey)).resolves.not.toThrow();
    });
  });

  test('Verify internal components are initialized properly after initialize() is called with a secret Key', async () => {
    const statsig = require('../index');
    expect.assertions(5);
    return statsig.initialize(secretKey).then(() => {
      expect(statsig.secretKey).toBe(secretKey);
      expect(statsig.logger).toBeDefined();
      expect(statsig.store).toBeDefined();
      expect(statsig.options.api).toBe('https://api.statsig.com/v1');
      expect(statsig.isReady).toBe(true);
    });
  });

  test('Verify cannot call checkGate() before initialize()', () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig
      .checkGate({ userID: '12345' }, 'my_gate')
      .catch((e) => expect(e.message).toMatch('Must call initialize() first.'));
  });

  test('Verify checkGate resolves to false for a gate that does not exist', async () => {
    expect.assertions(2);
    const statsig = require('../index');
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      return statsig
        .checkGate({ userID: '12345' }, 'my_nonexistent_gate')
        .then((data) => {
          expect(data).toBe(false);
          expect(spy).toHaveBeenCalledTimes(1);
        });
    });
  });

  test('Verify checkGate resolves to true for a gate that does exist', async () => {
    expect.assertions(2);
    const statsig = require('../index');
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      return statsig
        .checkGate({ userID: '12345' }, 'valid_gate')
        .then((data) => {
          expect(data).toBe(true);
          expect(spy).toHaveBeenCalledTimes(1);
        });
    });
  });

  test('Verify checkGate resolves to true for a gate that does exist for userID as a number', async () => {
    expect.assertions(2);
    const statsig = require('../index');
    statsig.initialize(secretKey);
    const spy = jest.spyOn(statsig.logger, 'log');
    return statsig.checkGate({ userID: 12345 }, 'valid_gate').then((data) => {
      expect(data).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify checkGate resolves to false when store ', async () => {
    expect.assertions(1);
    const statsig = require('../index');
    statsig.initialize(secretKey);
    return statsig
      .checkGate({ userID: '12345' }, 'should_throw')
      .then((data) => expect(data).toBe(false));
  });

  test('Verify cannot call getConfig() before initialize()', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig
      .getConfig({ userID: '12345' }, 'my_config')
      .catch((e) => expect(e.message).toMatch('Must call initialize() first.'));
  });

  test('Verify getConfig() resolves to the asked config', async () => {
    const statsig = require('../index');
    expect.assertions(2);
    statsig.initialize(secretKey);
    const spy = jest.spyOn(statsig.logger, 'log');
    return statsig
      .getConfig({ userID: '12345' }, 'my_config')
      .then((config) => {
        expect(config.name).toBe('my_config');
        expect(spy).toHaveBeenCalledTimes(1);
      });
  });

  test('Verify getConfig() resolves to the asked config with number as userID', async () => {
    const statsig = require('../index');
    expect.assertions(2);
    statsig.initialize(secretKey);
    const spy = jest.spyOn(statsig.logger, 'log');
    return statsig.getConfig({ userID: 12345 }, 'my_config').then((config) => {
      expect(config.name).toBe('my_config');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify getConfig() returns fallback config when name not provided', async () => {
    const statsig = require('../index');
    expect.assertions(3);
    statsig.initialize(secretKey);

    const spy = jest.spyOn(statsig.logger, 'log');
    return statsig.getConfig(null, null).then((config) => {
      expect(config.name).toBe('invalid_config_name');
      expect(config._groupName).toBe('statsig::invalid_config');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify logEvent() does not log before initialize()', () => {
    const statsig = require('../index');
    expect.assertions(1);
    statsig.logEvent({ userID: '12345' }, 'my_event');
    expect(statsig.logger).toBe(undefined);
  });

  test('Verify logEvent() does not log if eventName is null', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      statsig.logEvent({ userID: '12345' }, null);
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent() does not log if eventName is empty string', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      statsig.logEvent({ userID: '12345' }, '');
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent() does not log if eventName is an object', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      // @ts-ignore intentionally testing incorrect param type
      statsig.logEvent({ userID: '12345' }, { name: 'event' });
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify Event is logged without user', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      statsig.logEvent(null, 'event', 1, { price: 2 });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify Event is logged', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      statsig.logEvent({ userID: '12345' }, 'event', 1, { price: 2 });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify Event is logged', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig.logger, 'log');
      statsig.logEvent({ userID: 12345 }, 'event', 1, { price: 2 });
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
      const spy = jest.spyOn(statsig.logger, 'log');
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
});

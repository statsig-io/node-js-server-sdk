const { DynamicConfig } = require('../DynamicConfig');

describe('Verify behavior of top level index functions', () => {
  const LogEvent = require('../LogEvent');
  const fetch = require('node-fetch');
  const { FETCH_FROM_SERVER } = require('../ConfigSpec');
  jest.mock('node-fetch', () => jest.fn());
  const secretKey = 'secret-key';
  const str_64 =
    '1234567890123456789012345678901234567890123456789012345678901234';

  beforeEach(() => {
    jest.restoreAllMocks();
    fetch.mockImplementation((url) => {
      if (url.includes('check_gate')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: 'gate_server',
              value: true,
              rule_id: 'rule_id_gate_server',
            }),
        });
      } else if (url.includes('get_config')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: 'config_server',
              value: {
                string: '123',
                number: 123,
              },
              rule_id: 'rule_id_config_server',
            }),
        });
      }
      return Promise.reject();
    });

    // ensure Date.now() returns the same value in each test
    let now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
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

  test('Verify logEvent() throws if called before initialize()', () => {
    const statsig = require('../index');
    expect.assertions(1);
    expect(() => {
      statsig.logEvent({ userID: '12345' }, 'my_event');
    }).toThrowError(
      'statsigSDK::logEvent> Must call initialize() before logEvent().'
    );
  });

  test('Verify cannot call checkGate() before initialize()', async () => {
    const statsig = require('../index');
    expect.assertions(2);

    await expect(
      statsig.checkGate({ userID: '12345' }, 'my_gate')
    ).rejects.toEqual(new Error('Must call initialize() first.'));
    expect(statsig._logger).toBeFalsy();
  });

  test('Verify cannot call getConfig() before initialize()', async () => {
    const statsig = require('../index');
    expect.assertions(2);

    await statsig
      .getConfig({ userID: '12345' }, 'my_config')
      .catch((e) => expect(e.message).toMatch('Must call initialize() first.'));
    expect(statsig._logger).toBeFalsy();
  });

  test('Verify internal components are initialized properly after initialize() is called with a secret Key', async () => {
    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    expect.assertions(5);
    return statsig.initialize(secretKey).then(() => {
      expect(statsig._secretKey).toBe(secretKey);
      expect(statsig._logger).toBeDefined();
      expect(statsig._options.api).toBe('https://api.statsig.com/v1');
      expect(statsig._ready).toBe(true);
      expect(Evaluator.initialized).toBe(true);
    });
  });

  test('Verify cannot call checkGate() with no gate name', () => {
    const statsig = require('../index');
    expect.assertions(2);

    const spy = jest.spyOn(statsig._logger, 'log');
    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.checkGate(null)).rejects.toEqual(
        new Error('Must pass a valid gateName to check')
      );
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify cannot call checkGate() with invalid gate name', () => {
    const statsig = require('../index');
    expect.assertions(2);

    const spy = jest.spyOn(statsig._logger, 'log');
    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.checkGate({}, 12)).rejects.toEqual(
        new Error('Must pass a valid gateName to check')
      );
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify cannot call getConfig() with no config name', () => {
    const statsig = require('../index');
    expect.assertions(2);

    const spy = jest.spyOn(statsig._logger, 'log');
    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.getConfig({})).rejects.toEqual(
        new Error('Must pass a valid configName to check')
      );
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify cannot call getConfig() with invalid config name', () => {
    const statsig = require('../index');
    expect.assertions(2);

    const spy = jest.spyOn(statsig._logger, 'log');
    return statsig.initialize(secretKey).then(() => {
      // @ts-ignore intentionally testing incorrect param type
      expect(statsig.getConfig({}, false)).rejects.toEqual(
        new Error('Must pass a valid configName to check')
      );
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify when Evaluator fails, checkGate() returns correct value and logs an exposure correctly from server', async () => {
    expect.assertions(3);

    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'checkGate').mockImplementation((user, gateName) => {
      if (gateName === 'gate_pass')
        return { value: true, rule_id: 'rule_id_pass' };
      if (gateName === 'gate_server') return FETCH_FROM_SERVER;
      return { value: false, rule_id: 'rule_id_fail' };
    });
    await statsig.initialize(secretKey);

    let user = { userID: 123 };
    let gateName = 'gate_server';

    const spy = jest.spyOn(statsig._logger, 'log');
    const gateExposure = new LogEvent('statsig::gate_exposure');
    gateExposure.setUser(user);
    gateExposure.setMetadata({
      gate: gateName,
      gateValue: String(true),
      ruleID: 'rule_id_gate_server',
    });

    await expect(statsig.checkGate(user, gateName)).resolves.toStrictEqual(
      true
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(gateExposure);
  });

  test('Verify Evaluator returns correct value for checkGate() and logs an exposure correctly', async () => {
    expect.assertions(3);

    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'checkGate').mockImplementation((user, gateName) => {
      if (gateName === 'gate_pass')
        return { value: true, rule_id: 'rule_id_pass' };
      if (gateName === 'gate_server') return FETCH_FROM_SERVER;
      return { value: false, rule_id: 'rule_id_fail' };
    });
    await statsig.initialize(secretKey);

    let user = { userID: 123 };
    let gateName = 'gate_pass';

    const spy = jest.spyOn(statsig._logger, 'log');
    const gateExposure = new LogEvent('statsig::gate_exposure');
    gateExposure.setUser(user);
    gateExposure.setMetadata({
      gate: gateName,
      gateValue: String(true),
      ruleID: 'rule_id_pass',
    });

    await expect(statsig.checkGate(user, gateName)).resolves.toStrictEqual(
      true
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(gateExposure);
  });

  test('Verify Evaluator returns correct value (for failed gates) for checkGate() and logs an exposure correctly', async () => {
    expect.assertions(3);

    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'checkGate').mockImplementation((user, gateName) => {
      if (gateName === 'gate_pass')
        return { value: true, rule_id: 'rule_id_pass' };
      if (gateName === 'gate_server') return FETCH_FROM_SERVER;
      return { value: false, rule_id: 'rule_id_fail' };
    });
    await statsig.initialize(secretKey);

    let user = { userID: 123 };
    let gateName = 'gate_fail';

    const spy = jest.spyOn(statsig._logger, 'log');
    const gateExposure = new LogEvent('statsig::gate_exposure');
    gateExposure.setUser(user);
    gateExposure.setMetadata({
      gate: gateName,
      gateValue: String(false),
      ruleID: 'rule_id_fail',
    });

    await expect(statsig.checkGate(user, gateName)).resolves.toStrictEqual(
      false
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(gateExposure);
  });

  test('Verify when Evaluator fails to evaluate, getConfig() returns correct value and logs an exposure correctly after fetching from server', async () => {
    expect.assertions(4);

    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'getConfig').mockImplementation(() => {
      return FETCH_FROM_SERVER;
    });

    await statsig.initialize(secretKey);

    let user = { userID: 123 };
    let configName = 'config_server';

    const spy = jest.spyOn(statsig._logger, 'log');
    const configExposure = new LogEvent('statsig::config_exposure');
    configExposure.setUser(user);
    configExposure.setMetadata({
      config: configName,
      ruleID: 'rule_id_config_server',
    });

    await statsig.getConfig(user, configName).then((data) => {
      expect(data.getValue('number')).toStrictEqual(123);
      expect(data.getValue('string')).toStrictEqual('123');
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(configExposure);
  });

  test('Verify when Evaluator evaluates successfully, getConfig() returns correct value and logs an exposure', async () => {
    expect.assertions(4);

    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'getConfig').mockImplementation((_, configName) => {
      return new DynamicConfig(
        configName,
        {
          string: '12345',
          number: 12345,
        },
        'rule_id_config'
      );
    });
    await statsig.initialize(secretKey);

    let user = { userID: 123 };
    let configName = 'config_downloaded';

    const spy = jest.spyOn(statsig._logger, 'log');
    const configExposure = new LogEvent('statsig::config_exposure');
    configExposure.setUser(user);
    configExposure.setMetadata({
      config: configName,
      ruleID: 'rule_id_config',
    });

    await statsig.getConfig(user, configName).then((data) => {
      expect(data.getValue('number')).toStrictEqual(12345);
      expect(data.getValue('string')).toStrictEqual('12345');
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(configExposure);
  });

  test('that getConfig() returns an empty DynamicConfig when the config name does not exist', async () => {
    expect.assertions(2);

    const statsig = require('../index');
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'getConfig').mockImplementation(() => {
      return null;
    });
    await statsig.initialize(secretKey);

    const configName = 'non_existent_config';
    let config = new DynamicConfig(configName);

    const spy = jest.spyOn(statsig._logger, 'log');
    await statsig.getConfig({}, configName).then((data) => {
      expect(data).toEqual(config);
    });

    expect(spy).toHaveBeenCalledTimes(0);
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

  test('Verify logEventObject can override timestamp', async () => {
    const statsig = require('../index');
    expect.assertions(1);
    return statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(statsig._logger, 'log');
      statsig.logEventObject({
        name: 'event',
        time: 123,
      });

      const logEvent = new LogEvent('event');
      logEvent.setMetadata(null);
      logEvent.setUser(null);
      logEvent.setValue(null);
      logEvent.setTime(123);
      expect(spy).toBeCalledWith(logEvent);
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

  test('calling initialize() multiple times will only make 1 request and resolve together', async () => {
    expect.assertions(4);
    const statsig = require('../index');
    let count = 0;
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, 'init').mockImplementation(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          count++;
          resolve();
        }, 1000);
      });
    });

    // initialize() twice simultaneously reulsts in 1 promise
    const v1 = statsig.initialize(secretKey);
    const v2 = statsig.initialize(secretKey);
    await expect(v1).resolves.not.toThrow();
    await expect(v2).resolves.not.toThrow();

    // initialize() again after the first one completes resolves right away
    await expect(statsig.initialize(secretKey)).resolves.not.toThrow();
    expect(count).toEqual(1);
  });
});

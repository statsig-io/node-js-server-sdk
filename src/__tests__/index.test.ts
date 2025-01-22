import ConfigEvaluation from '../ConfigEvaluation';
import DynamicConfig from '../DynamicConfig';
import {
  StatsigInvalidArgumentError,
  StatsigUninitializedError,
} from '../Errors';
import { EvaluationDetails } from '../EvaluationDetails';
import Statsig from '../index';
import LogEvent from '../LogEvent';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import StatsigTestUtils, { parseLogEvents } from './StatsigTestUtils';

const exampleConfigSpecs = require('./jest.setup');

jest.useFakeTimers();

let flushedEventCount = 0;

jest.mock('node-fetch', () => jest.fn());
// @ts-ignore
const fetch = require('node-fetch');
// @ts-ignore
fetch.mockImplementation((url, params) => {
  if (url.includes('log_event') || url.includes('rgstr')) {
    // We use `Promise.resolve().then(` to let the "flush() works" test run
    // synchronous code before the events are counted
    return Promise.resolve().then(() => {
      // Simulate 10ms delay
      jest.advanceTimersByTime(10);
      const events = parseLogEvents(params).events;
      flushedEventCount += events.length;
      return {
        ok: true,
        json: () => Promise.resolve({}),
      };
    });
  }
  return Promise.reject();
});

describe('Verify behavior of top level index functions', () => {
  const secretKey = 'secret-key';

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.resetModules();

    try {
      await Statsig.shutdownAsync();
    } catch {
      /* noop */
    }

    StatsigInstanceUtils.setInstance(null);
    flushedEventCount = 0;

    // ensure Date.now() returns the same value in each test
    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
  });

  test('Verify initialize() returns an error when a secret key is not provided', async () => {
    // @ts-ignore
    return expect(Statsig.initialize()).rejects.toEqual(
      new Error(
        'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk',
      ),
    );
  });

  test('Verify initialize() doesnt re-use a bad instance', async () => {
    try {
      await Statsig.initialize('bad-key');
    } catch {
      // @ts-ignore
      return expect(
        Statsig.initialize('secret-blah', { localMode: true }),
      ).resolves.not.toThrow();
    }
  });

  test('Verify initialize() returns an error when an empty secret key is provided', async () => {
    return expect(Statsig.initialize('')).rejects.toEqual(
      new Error(
        'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk',
      ),
    );
  });

  test('Verify initialize() returns an error when a client key is provided', async () => {
    return expect(
      Statsig.initialize('client-abcdefg1234567890'),
    ).rejects.toEqual(
      new Error(
        'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk',
      ),
    );
  });

  test('Verify logEvent() throws if called before initialize()', () => {
    expect.assertions(1);

    try {
      Statsig.logEvent({ userID: '12345' }, 'my_event');
    } catch (e) {
      expect(e).toEqual(new StatsigUninitializedError());
    }
  });

  test('Verify cannot call checkGate) before initialize()', async () => {
    expect.assertions(2);

    try {
      Statsig.checkGate({ userID: '12345' }, 'my_gate');
    } catch (e) {
      expect(e).toEqual(new StatsigUninitializedError());
    }

    expect(StatsigInstanceUtils.getInstance()).toBeNull();
  });

  test('Verify cannot call getConfig() before initialize()', async () => {
    expect.assertions(2);

    try {
      await Statsig.getConfig({ userID: '12345' }, 'my_config');
    } catch (e) {
      expect(e).toEqual(new StatsigUninitializedError());
    }

    expect(StatsigInstanceUtils.getInstance()).toBeNull();
  });

  test('Verify cannot call getExperiment() before initialize()', async () => {
    expect.assertions(2);

    try {
      Statsig.getExperiment({ userID: '12345' }, 'my_exp');
    } catch (e) {
      expect(e).toEqual(new StatsigUninitializedError());
    }

    expect(StatsigInstanceUtils.getInstance()).toBeNull();
  });

  test('Verify internal components are initialized properly after initialize() is called with a secret Key', async () => {
    expect.assertions(5);
    return Statsig.initialize(secretKey).then(() => {
      const inst = StatsigInstanceUtils.getInstance() as any;
      expect(inst._secretKey).toBe(secretKey);
      expect(StatsigTestUtils.getLogger()).toBeDefined();
      expect(inst._options.api).toBe('https://statsigapi.net/v1');
      expect(inst._ready).toBe(true);
      expect(StatsigTestUtils.getEvaluator().initialized).toBe(true);
    });
  });

  test('Verify cannot call checkGate) with no gate name', async () => {
    expect.assertions(3);
    await Statsig.initialize(secretKey);

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');

    // @ts-ignore intentionally testing incorrect param type
    expect(() => Statsig.checkGate(null)).toThrow(
      new Error('Lookup key must be a non-empty string'),
    );
    expect(spy).toHaveBeenCalledTimes(0);

    expect(spy).toHaveBeenCalledTimes(0);
  });

  test('Verify cannot call checkGate() with invalid gate name', () => {
    expect.assertions(2);

    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      // @ts-ignore intentionally testing incorrect param type
      expect(() => Statsig.checkGate({ userID: '123' }, 12)).toThrow(
        new Error('Lookup key must be a non-empty string'),
      );
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('cannot call checkGate(), getConfig(), or getExperiment() with no user or userID or customID', async () => {
    expect.assertions(6);

    await Statsig.initialize(secretKey);

    // @ts-ignore
    expect(() => Statsig.checkGate(null, 'test_gate')).toThrow(
      new StatsigInvalidArgumentError(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      ),
    );

    expect(
      // @ts-ignore
      () => Statsig.checkGate({ email: '123@gmail.com' }, 'test_gate'),
    ).toThrow(
      new Error(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      ),
    );

    // @ts-ignore
    expect(() => Statsig.getConfig(null, 'test_config')).toThrow(
      new Error(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      ),
    );

    expect(
      // @ts-ignore
      () => Statsig.getConfig({ email: '123@gmail.com' }, 'test_config'),
    ).toThrow(
      new Error(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      ),
    );

    // @ts-ignore
    expect(() => Statsig.getExperiment(null, 'test_exp')).toThrow(
      new Error(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      ),
    );
    expect(
      // @ts-ignore
      () => Statsig.getExperiment({ email: '123@gmail.com' }, 'test_exp'),
    ).toThrow(
      new Error(
        'Must pass a valid user with a userID or customID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
      ),
    );
  });

  test('can call checkGate(), getConfig(), or getExperiment() with no userID if you provide a customID', async () => {
    expect.assertions(4);

    await Statsig.initialize(secretKey);
    expect(
      Statsig.checkGate({ customIDs: { test: '123' } }, 'test_gate123'),
    ).toEqual(false);

    const config = await Statsig.getConfig(
      { customIDs: { test: '123' } },
      'test_config123',
    );
    expect(config.value).toEqual({});

    const exp = await Statsig.getExperiment(
      { customIDs: { test: '123' } },
      'test_exp',
    );
    expect(exp.value).toEqual({});

    const layer = await Statsig.getLayer(
      { customIDs: { test: '123' } },
      'test_exp',
    );
    expect(layer.get('test', 14)).toEqual(14);
  });

  test('Verify cannot call getConfig() or getExperiment() with no config name', () => {
    expect.assertions(3);

    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      // @ts-ignore intentionally testing incorrect param type
      expect(() => Statsig.getConfig({ userID: '123' })).toThrow(
        new Error('Lookup key must be a non-empty string'),
      );
      // @ts-ignore intentionally testing incorrect param type
      expect(() => Statsig.getExperiment({ userID: '123' })).toThrow(
        new Error('Lookup key must be a non-empty string'),
      );
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify cannot call getConfig() with invalid config name', async () => {
    expect.assertions(4);

    await Statsig.initialize(secretKey, { disableDiagnostics: true });

    // @ts-ignore intentionally testing incorrect param type
    try {
      Statsig.getConfig({ userID: '123' }, false);
    } catch (e) {
      expect(e.message).toBe('Lookup key must be a non-empty string');
    }
    // @ts-ignore intentionally testing incorrect param type
    try {
      Statsig.getExperiment({ userID: '123' }, false);
    } catch (e) {
      expect(e.message).toBe('Lookup key must be a non-empty string');
    }
    expect(StatsigTestUtils.getLogger().queue).toHaveLength(1); // Has only diagnostics initialize
    expect(StatsigTestUtils.getLogger().queue[0].eventName).toBe(
      'statsig::diagnostics',
    );
  });

  test(
    'Verify when Evaluator fails, checkGate() returns correct ' +
      'value and does not log an exposure',
    async () => {
      expect.assertions(3);

      await Statsig.initialize(secretKey, { disableDiagnostics: true });
      jest
        .spyOn(StatsigTestUtils.getEvaluator(), 'checkGate')
        .mockImplementation((_user, _gateName) => {
          return ConfigEvaluation.unsupported(-1, -2, undefined);
        });
      const user = {
        userID: '123',
        privateAttributes: { secret: 'do not log' },
      };

      const res = await Statsig.checkGate(user, 'gate_server');
      expect(res).toStrictEqual(false);
      expect(StatsigTestUtils.getLogger().queue).toHaveLength(2);
      expect(StatsigTestUtils.getLogger().queue[1]).toMatchObject({
        eventName: 'statsig::gate_exposure',
        metadata: {
          configSyncTime: -1,
          gate: 'gate_server',
          gateValue: 'false',
          initTime: -2,
          reason: 'Unsupported',
          ruleID: '',
        },
      });
    },
  );

  test('Verify Evaluator returns correct value for checkGate() and logs an exposure correctly', async () => {
    expect.assertions(3);

    await Statsig.initialize(secretKey);

    jest
      .spyOn(StatsigTestUtils.getEvaluator(), 'checkGate')
      .mockImplementation((user, gateName) => {
        if (gateName === 'gate_pass') {
          return new ConfigEvaluation(true, 'rule_id_pass', '', 'userID', [
            { gate: 'dependent_gate', gateValue: 'true', ruleID: 'rule_22' },
          ]);
        }

        if (gateName === 'gate_server') {
          return ConfigEvaluation.unsupported(-1, -1, undefined);
        }

        return new ConfigEvaluation(false, 'rule_id_fail', '');
      });

    const user = { userID: '123', privateAttributes: { secret: 'do not log' } };
    const gateName = 'gate_pass';

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    const gateExposure = new LogEvent('statsig::gate_exposure');
    gateExposure.setUser({
      userID: '123',
    });
    gateExposure.setMetadata({
      gate: gateName,
      gateValue: String(true),
      ruleID: 'rule_id_pass',
    });
    gateExposure.setSecondaryExposures([
      { gate: 'dependent_gate', gateValue: 'true', ruleID: 'rule_22' },
    ]);

    await expect(Statsig.checkGate(user, gateName)).toStrictEqual(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(gateExposure);
  });

  test('Verify Evaluator returns correct value (for failed gates) for checkGate() and logs an exposure correctly', async () => {
    expect.assertions(3);

    // also set and verify environment is passed on to user as statsigEnvironment
    await Statsig.initialize(secretKey, {
      environment: { tier: 'production' },
    });

    jest
      .spyOn(StatsigTestUtils.getEvaluator(), 'checkGate')
      .mockImplementation((user, gateName) => {
        if (gateName === 'gate_pass') {
          return new ConfigEvaluation(true, 'rule_id_pass', '', 'userID', []);
        }

        if (gateName === 'gate_server') {
          return ConfigEvaluation.unsupported(-1, -1, undefined);
        }

        return new ConfigEvaluation(false, 'rule_id_fail', '', 'userID', []);
      });

    const user = { userID: '123', privateAttributes: { secret: 'do not log' } };
    const gateName = 'gate_fail';

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    const gateExposure = new LogEvent('statsig::gate_exposure');
    gateExposure.setUser({
      userID: '123',
      // @ts-ignore
      statsigEnvironment: { tier: 'production' },
    });
    gateExposure.setMetadata({
      gate: gateName,
      gateValue: String(false),
      ruleID: 'rule_id_fail',
    });
    gateExposure.setSecondaryExposures([]);

    await expect(Statsig.checkGate(user, gateName)).toStrictEqual(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(gateExposure);
  });

  test(
    'Verify when Evaluator fails to evaluate, getConfig() and getExperiment()' +
      ' return correct value and logs unsupported',
    async () => {
      expect.assertions(3);

      await Statsig.initialize(secretKey, { disableDiagnostics: true });

      jest
        .spyOn(StatsigTestUtils.getEvaluator(), 'getConfig')
        .mockImplementation(() => {
          return ConfigEvaluation.unsupported(-1, -2, undefined);
        });

      const user = {
        userID: '123',
        privateAttributes: { secret: 'do not log' },
      };
      const configName = 'config_server';

      let data = await Statsig.getConfig(user, configName);
      expect(data.value).toEqual({});

      data = await Statsig.getExperiment(user, configName);
      expect(data.value).toEqual({});

      expect(StatsigTestUtils.getLogger().queue[1]).toMatchObject({
        eventName: 'statsig::config_exposure',
        metadata: expect.objectContaining({
          config: 'config_server',
          configSyncTime: -1,
          initTime: -2,
          reason: 'Unsupported',
          ruleID: '',
        }),
      });
    },
  );

  test('Verify when Evaluator evaluates successfully, getConfig() and getExperiment() return correct value and logs an exposure', async () => {
    expect.assertions(10);

    await Statsig.initialize(secretKey);
    jest
      .spyOn(StatsigTestUtils.getEvaluator(), 'getConfig')
      .mockImplementation((_, configName) => {
        return new ConfigEvaluation(
          true,
          'rule_id_config',
          'group_name_config',
          'userID',
          [],
          {
            string: '12345',
            number: 12345,
          },
        );
      });

    const user = { userID: '123', privateAttributes: { secret: 'do not log' } };
    const configName = 'config_downloaded';

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    const configExposure = new LogEvent('statsig::config_exposure');
    configExposure.setUser({
      userID: '123',
    });
    configExposure.setMetadata({
      config: configName,
      ruleID: 'rule_id_config',
      rulePassed: 'true',
    });
    configExposure.setSecondaryExposures([]);

    let config = Statsig.getConfig(user, configName);
    expect(config.getValue('number')).toStrictEqual(12345);
    expect(config.getValue('string')).toStrictEqual('12345');
    expect(config.getGroupName()).toBe('group_name_config');
    expect(config.getRuleID()).toBe('rule_id_config');

    let experiment = Statsig.getExperiment(user, configName);
    expect(experiment.getValue('number')).toStrictEqual(12345);
    expect(experiment.getValue('string')).toStrictEqual('12345');
    expect(experiment.getGroupName()).toBe('group_name_config');
    expect(experiment.getRuleID()).toBe('rule_id_config');

    expect(spy).toHaveBeenCalledTimes(1); // Dedupe logic kicks in
    expect(spy).toHaveBeenCalledWith(configExposure);
  });

  test('Verify that getConfig() and getExperiment() are deduped with same metadata', async () => {
    expect.assertions(1);

    await Statsig.initialize(secretKey);

    jest
      .spyOn(StatsigTestUtils.getEvaluator(), 'getConfig')
      .mockImplementation((_, configName) => {
        return new ConfigEvaluation(true, 'rule_id_config', '', 'userID', [], {
          string: '12345',
          number: 12345,
        });
      });

    const user = { userID: '123', privateAttributes: { secret: 'do not log' } };
    const configName = 'config_downloaded';

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    for (let ii = 0; ii < 10000; ii++) {
      Statsig.getConfig(user, configName);
    }

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('Verify that getConfig() and getExperiment() are not deduped with different user', async () => {
    expect.assertions(1);

    await Statsig.initialize(secretKey);

    jest
      .spyOn(StatsigTestUtils.getEvaluator(), 'getConfig')
      .mockImplementation((_, configName) => {
        return new ConfigEvaluation(true, 'rule_id_config', '', 'userID', [], {
          string: '12345',
          number: 12345,
        });
      });

    const user = { userID: '123', privateAttributes: { secret: 'do not log' } };
    const configName = 'config_downloaded';

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    for (let ii = 0; ii < 10000; ii++) {
      user.userID = ii + '';
      Statsig.getConfig(user, configName);
    }

    expect(spy).toHaveBeenCalledTimes(10000);
  });

  test('Verify that getConfig() and getExperiment() are not deduped with different metadata', async () => {
    expect.assertions(1);
    await Statsig.initialize(secretKey);

    const user = { userID: '123', privateAttributes: { secret: 'do not log' } };
    const configName = 'config_downloaded';

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    for (let ii = 0; ii < 10000; ii++) {
      // @ts-ignore
      jest
        .spyOn(StatsigTestUtils.getEvaluator(), 'getConfig')
        .mockImplementation((_, configName) => {
          return new ConfigEvaluation(
            true,
            'rule_id_config_' + ii,
            '',
            'userID',
            [],
            {
              string: '12345',
            },
          );
        });
      Statsig.getConfig(user, configName);
    }

    expect(spy).toHaveBeenCalledTimes(10000);
  });

  test('that getConfig() and getExperiment() return an empty DynamicConfig when the config name does not exist', async () => {
    expect.assertions(4);

    await Statsig.initialize(secretKey);

    jest
      .spyOn(StatsigTestUtils.getEvaluator().store, 'getInitReason')
      .mockReturnValue(() => {
        'Network';
      });

    const configName = 'non_existent_config';
    const config = new DynamicConfig(
      configName,
      {},
      '',
      null,
      null,
      [],
      null,
      EvaluationDetails.make(0, -1, 'Unrecognized'),
    );

    const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
    let configRes = Statsig.getConfig({ userID: '12345' }, configName);
    expect(configRes.getRuleID()).toBe('');
    expect(configRes.getGroupName()).toBe(null);

    let exp = Statsig.getExperiment({ userID: '12345' }, configName);
    expect(exp).toEqual(config);

    expect(spy).toHaveBeenCalledTimes(1); // Dedupe logic kicks in
  });

  test('Verify logEvent() does not log if eventName is null', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      // @ts-ignore
      Statsig.logEvent({ userID: '12345' }, null);
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent() does not log if eventName is empty string', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      Statsig.logEvent({ userID: '12345' }, '');
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent() does not log if eventName is an object', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      // @ts-ignore intentionally testing incorrect param type
      Statsig.logEvent({ userID: '12345' }, { name: 'event' });
      expect(spy).toHaveBeenCalledTimes(0);
    });
  });

  test('Verify logEvent can log a 0 value', async () => {
    const statsig = require('../index');
    expect.assertions(2);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      Statsig.logEvent({ userID: '123' }, 'test', 0);

      const logEvent = new LogEvent('test');
      logEvent.setMetadata(null);
      logEvent.setUser({ userID: '123' });
      logEvent.setValue(0);
      expect(spy).toBeCalledWith(logEvent);
      expect(logEvent.toObject().value).toEqual(0);
    });
  });

  test('Verify logEvent can log an empty string value', async () => {
    const statsig = require('../index');
    expect.assertions(2);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      Statsig.logEvent({ userID: '123' }, 'test', '');

      const logEvent = new LogEvent('test');
      logEvent.setMetadata(null);
      logEvent.setUser({ userID: '123' });
      logEvent.setValue('');
      expect(spy).toBeCalledWith(logEvent);
      expect(logEvent.toObject().value).toEqual('');
    });
  });

  test('Verify logEventObject can override timestamp', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      Statsig.logEventObject({
        eventName: 'event',
        time: 123 as any,
        user: { userID: '123', privateAttributes: { secret: 'do not log' } },
      });

      const logEvent = new LogEvent('event');
      logEvent.setMetadata(null);
      logEvent.setUser({ userID: '123' });
      logEvent.setValue(null);
      logEvent.setTime(123);
      expect(spy).toBeCalledWith(logEvent);
    });
  });

  test('Verify Event is logged without user', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      // @ts-ignore
      Statsig.logEvent(null, 'event', 1, { price: '2' });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify Event is logged', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      Statsig.logEvent({ userID: '12345' }, 'event', 1, { price: '2' });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify Event is logged', async () => {
    expect.assertions(1);
    return Statsig.initialize(secretKey).then(() => {
      const spy = jest.spyOn(StatsigTestUtils.getLogger(), 'log');
      // @ts-ignore
      Statsig.logEvent({ userID: 12345 }, 'event', 1, { price: '2' });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test('Verify shutdown makes the SDK not ready and clears all the timers', async () => {
    // @ts-ignore
    const fetch = require('node-fetch');
    expect.assertions(6);

    return Statsig.initialize(secretKey).then(() => {
      const logger = StatsigTestUtils.getLogger();
      const evaluator = StatsigTestUtils.getEvaluator();

      const spy = jest.spyOn(logger, 'flush');
      Statsig.shutdown();
      expect(spy).toHaveBeenCalledTimes(1);
      // @ts-ignore
      expect(StatsigInstanceUtils.getInstance()._ready).toBe(false);

      expect(logger.flushTimer).toBeNull();
      expect(logger.deduperTimer).toBeNull();
      expect(evaluator.store.rulesetsSyncTimer).toBeNull();
      expect(evaluator.store.idListsSyncTimer).toBeNull();
    });
  });

  test('calling initialize() multiple times will only make 1 request and resolve together', async () => {
    expect.assertions(3);

    // initialize() twice simultaneously results in 1 promise
    const v1 = Statsig.initialize(secretKey);
    const v2 = Statsig.initialize(secretKey);
    await expect(v1).resolves.not.toThrow();
    await expect(v2).resolves.not.toThrow();

    // initialize() again after the first one completes resolves right away
    await expect(Statsig.initialize(secretKey)).resolves.not.toThrow();
  });

  test('flush() works', async () => {
    jest.advanceTimersByTime(100);
    flushedEventCount = 0;

    expect.assertions(2);

    await Statsig.initialize(secretKey, { disableDiagnostics: true });
    Statsig.logEvent({ userID: '123' }, 'my_event1');
    Statsig.logEvent({ userID: '123' }, 'my_event2');
    Statsig.logEvent({ userID: '123' }, 'my_event3');
    Statsig.checkGate({ userID: '456' }, exampleConfigSpecs.gate.name);
    Statsig.checkGate({ userID: '456' }, exampleConfigSpecs.gate.name);

    const flushPromise = Statsig.flush();
    expect(flushedEventCount).toEqual(0);
    jest.advanceTimersByTime(20);
    await flushPromise;
    expect(flushedEventCount).toEqual(4);
  });
});

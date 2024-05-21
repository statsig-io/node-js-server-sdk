import * as statsigsdk from '../index';
import type { LogEventData } from '../LogEvent';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { parseLogEvents } from './StatsigTestUtils';
// @ts-ignore
const statsig = statsigsdk.default;

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/download_config_spec.json'),
);

type NonNullableNested<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

const INIT_RESPONSE = require('./data/initialize_response.json');
let postedLogs: { events: NonNullableNested<LogEventData>[] } = {
  events: [],
};

jest.mock('node-fetch', () => jest.fn());
// @ts-ignore
const fetch = require('node-fetch');
// @ts-ignore
fetch.mockImplementation((url, params) => {
  if (url.includes('download_config_specs')) {
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
    });
  }
  if (url.includes('log_event')) {
    postedLogs = parseLogEvents(params, false);
    return Promise.resolve({
      ok: true,
    });
  }
  if (url.includes('get_id_lists')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  }

  return Promise.reject();
});

describe('Verify e2e behavior of the SDK with mocked network', () => {
  jest.mock('node-fetch', () => jest.fn());
  const statsigUser = {
    userID: '123',
    email: 'testuser@statsig.com',
  };
  const randomUser = {
    userID: 'random',
    privateAttributes: {
      email: undefined,
    },
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();

    StatsigInstanceUtils.setInstance(null);
    postedLogs = {
      events: [],
    };
  });

  test('Verify checkGate and exposure logs', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });
    const clientInitializeResponse =
      statsig.getClientInitializeResponse(statsigUser);
    if (clientInitializeResponse != null) {
      expect(clientInitializeResponse.time).toBeGreaterThan(0);
      delete clientInitializeResponse.time;
    }
    const initResponse = INIT_RESPONSE;
    delete initResponse.time;
    expect(clientInitializeResponse).toEqual(initResponse);
    const on1 = await statsig.checkGate(statsigUser, 'always_on_gate');
    expect(on1).toEqual(true);

    const on2 = await statsig.checkGate(statsigUser, 'always_on_gate');
    expect(on2).toEqual(true);

    const on3 = await statsig.checkGate(statsigUser, 'always_on_gate');
    expect(on3).toEqual(true);

    const gate = statsig.getFeatureGateSync(statsigUser, 'always_on_gate');
    expect(gate.idType).toEqual('userID');

    const passingEmail = await statsig.checkGate(
      statsigUser,
      'on_for_statsig_email',
    );
    expect(passingEmail).toEqual(true);
    const failingEmail = await statsig.checkGate(
      randomUser,
      'on_for_statsig_email',
    );
    expect(failingEmail).toEqual(false);

    const unsupportedGate = await statsig.checkGate(
      statsigUser,
      'unsupported_condition_type',
    );
    expect(unsupportedGate).toEqual(false);

    statsig.shutdown();
    expect(postedLogs.events.length).toEqual(5);
    expect(postedLogs.events[0].eventName).toEqual('statsig::diagnostics');
    expect(postedLogs.events[1].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[1].metadata['gate']).toEqual('always_on_gate');
    expect(postedLogs.events[1].metadata['gateValue']).toEqual('true');
    expect(postedLogs.events[1].metadata['ruleID']).toEqual(
      '2DWuOvXQZWKvoaNm27dqcs',
    );

    expect(postedLogs.events[2].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[2].metadata['gate']).toEqual(
      'on_for_statsig_email',
    );
    expect(postedLogs.events[2].metadata['gateValue']).toEqual('true');
    expect(postedLogs.events[2].metadata['ruleID']).toEqual(
      '3jdTW54SQWbbxFFZJe7wYZ',
    );

    expect(postedLogs.events[3].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[3].metadata['gate']).toEqual(
      'on_for_statsig_email',
    );
    expect(postedLogs.events[3].metadata['gateValue']).toEqual('false');
    expect(postedLogs.events[3].metadata['ruleID']).toEqual('default');
  });

  test('Verify checkGateWithoutServerFallback and exposure logs', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });
    const clientInitializeResponse =
      statsig.getClientInitializeResponse(statsigUser);
    if (clientInitializeResponse != null) {
      expect(clientInitializeResponse.time).toBeGreaterThan(0);
      delete clientInitializeResponse.time;
    }
    const initResponse = INIT_RESPONSE;
    delete initResponse.time;
    expect(clientInitializeResponse).toEqual(initResponse);
    const on1 = statsig.checkGateWithoutServerFallback(
      statsigUser,
      'always_on_gate',
    );
    expect(on1).toEqual(true);

    const on2 = statsig.checkGateWithoutServerFallback(
      statsigUser,
      'always_on_gate',
    );
    expect(on2).toEqual(true);

    const on3 = statsig.checkGateWithoutServerFallback(
      statsigUser,
      'always_on_gate',
    );
    expect(on3).toEqual(true);

    const passingEmail = statsig.checkGateWithoutServerFallback(
      statsigUser,
      'on_for_statsig_email',
    );
    expect(passingEmail).toEqual(true);
    const failingEmail = statsig.checkGateWithoutServerFallback(
      randomUser,
      'on_for_statsig_email',
    );
    expect(failingEmail).toEqual(false);

    const unsupportedGate = statsig.checkGateWithoutServerFallback(
      statsigUser,
      'unsupported_condition_type',
    );
    expect(unsupportedGate).toEqual(false);

    statsig.shutdown();
    expect(postedLogs.events.length).toEqual(5);
    expect(postedLogs.events[0].eventName).toEqual('statsig::diagnostics');
    expect(postedLogs.events[1].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[1].metadata['gate']).toEqual('always_on_gate');
    expect(postedLogs.events[1].metadata['gateValue']).toEqual('true');
    expect(postedLogs.events[1].metadata['ruleID']).toEqual(
      '2DWuOvXQZWKvoaNm27dqcs',
    );

    expect(postedLogs.events[2].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[2].metadata['gate']).toEqual(
      'on_for_statsig_email',
    );
    expect(postedLogs.events[2].metadata['gateValue']).toEqual('true');
    expect(postedLogs.events[2].metadata['ruleID']).toEqual(
      '3jdTW54SQWbbxFFZJe7wYZ',
    );

    expect(postedLogs.events[3].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[3].metadata['gate']).toEqual(
      'on_for_statsig_email',
    );
    expect(postedLogs.events[3].metadata['gateValue']).toEqual('false');
    expect(postedLogs.events[3].metadata['ruleID']).toEqual('default');

    expect(postedLogs.events[4].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[4].metadata['gate']).toEqual(
      'unsupported_condition_type',
    );
    expect(postedLogs.events[4].metadata['gateValue']).toEqual('false');
    expect(postedLogs.events[4].metadata['ruleID']).toEqual('');
    expect(postedLogs.events[4].metadata['reason']).toEqual('Unsupported');
  });

  test('Verify getConfig and exposure logs', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });
    let config = await statsig.getConfig(statsigUser, 'test_config');
    expect(config.getGroupName()).toBe('statsig emails');
    expect(config.getRuleID()).toBe('4lInPNRUnjUzaWNkEWLFA9');
    expect(config.getIDType()).toBe('userID');

    expect(config.get('number', 0)).toEqual(7);
    expect(config.get('string', '')).toEqual('statsig');
    expect(config.get('boolean', true)).toEqual(false);
    config = await statsig.getConfig(randomUser, 'test_config');
    expect(config.get('number', 0)).toEqual(4);
    expect(config.get('string', '')).toEqual('default');
    expect(config.get('boolean', false)).toEqual(true);

    // unsupported returns no values
    config = await statsig.getConfig(
      statsigUser,
      'test_config_unsupported_condition',
    );
    expect(config.value).toEqual({});

    statsig.shutdown();
    postedLogs.events = postedLogs.events.filter(
      (event) => event.eventName !== 'statsig::diagnostics',
    );
    expect(postedLogs.events.length).toEqual(3);
    expect(postedLogs.events[0].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[0].metadata['config']).toEqual('test_config');
    expect(postedLogs.events[0].metadata['ruleID']).toEqual(
      '4lInPNRUnjUzaWNkEWLFA9',
    );

    expect(postedLogs.events[1].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[1].metadata['config']).toEqual('test_config');
    expect(postedLogs.events[1].metadata['ruleID']).toEqual('default');

    expect(postedLogs.events[2].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[2].metadata['config']).toEqual(
      'test_config_unsupported_condition',
    );
    expect(postedLogs.events[2].metadata['ruleID']).toEqual('');
    expect(postedLogs.events[2].metadata['reason']).toEqual('Unsupported');
  });

  test('Verify getExperiment and exposure logs', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });
    let experiment = await statsig.getExperiment(
      statsigUser,
      'sample_experiment',
    );
    expect(experiment.get('sample_parameter', true)).toEqual(false);
    experiment = await statsig.getExperiment(randomUser, 'sample_experiment');
    expect(experiment.getGroupName()).toBe('Test');
    expect(experiment.getRuleID()).toBe('5yQbPNUpd8mNbkB0SZZeln');
    expect(experiment.getIDType()).toBe('userID');

    expect(experiment.get('sample_parameter', false)).toEqual(true);

    statsig.shutdown();
    postedLogs.events = postedLogs.events.filter(
      (event) => event.eventName !== 'statsig::diagnostics',
    );
    expect(postedLogs.events.length).toEqual(2);
    expect(postedLogs.events[0].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[0].metadata['config']).toEqual(
      'sample_experiment',
    );
    expect(postedLogs.events[0].metadata['ruleID']).toEqual(
      '5yQbPMfmKQdiRV35hS3B2l',
    );

    expect(postedLogs.events[1].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[1].metadata['config']).toEqual(
      'sample_experiment',
    );
    expect(postedLogs.events[1].metadata['ruleID']).toEqual(
      '5yQbPNUpd8mNbkB0SZZeln',
    );
  });

  test('Verify getLayer and exposure logs', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });

    // should delegate to a unsupported config, which returns no values
    let layer = await statsig.getLayer(
      statsigUser,
      'd_layer_delegate_to_fallback',
    );
    expect(layer.getValue('b_param', 'err')).toBe('err');
    expect(layer.getRuleID()).toEqual('');
    expect(layer.getGroupName()).toBeNull();

    layer = await statsig.getLayer(
      randomUser,
      'statsig::sample_experiment_layer',
    );
    expect(layer.getRuleID()).toEqual('5yQbPNUpd8mNbkB0SZZeln');
    expect(layer.getGroupName()).toEqual('Test');
    expect(layer.getAllocatedExperimentName()).toEqual('sample_experiment');

    statsig.shutdown();
    // fallback does not log an exposure, so nothing gets set here
    postedLogs.events = postedLogs.events.filter(
      (event) => event.eventName !== 'statsig::diagnostics',
    );
    expect(postedLogs.events).toEqual([]);
  });

  test('Verify logEvent', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });
    statsig.logEvent(statsigUser, 'add_to_cart', 'SKU_12345', {
      price: '9.99',
      item_name: 'diet_coke_48_pack',
    });
    statsig.shutdown();
    postedLogs.events = postedLogs.events.filter(
      (event) => event.eventName !== 'statsig::diagnostics',
    );
    expect(postedLogs.events.length).toEqual(1);
    expect(postedLogs.events[0].eventName).toEqual('add_to_cart');
    expect(postedLogs.events[0].value).toEqual('SKU_12345');
    expect(postedLogs.events[0].metadata['price']).toEqual('9.99');
    expect(postedLogs.events[0].metadata['item_name']).toEqual(
      'diet_coke_48_pack',
    );
    expect(postedLogs.events[0].user.userID).toEqual('123');
    expect(postedLogs.events[0].user.email).toEqual('testuser@statsig.com');
  });

  test('Verify list APIs', async () => {
    await statsig.initialize('secret-123', { disableDiagnostics: true });
    expect(statsig.getFeatureGateList()).toContain('always_on_gate');
    expect(statsig.getDynamicConfigList()).toContain('test_config');
    expect(statsig.getExperimentList()).toContain('sample_experiment');
    expect(statsig.getAutotuneList()).toContain('test_autotune');
    expect(statsig.getLayerList()).toContain('statsig::test_layer');
    statsig.shutdown();
  });
});

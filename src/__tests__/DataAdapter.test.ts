import exampleConfigSpecs from './jest.setup';
import * as statsigsdk from '../index';
import { AdapterResponse, IDataAdapter } from '../interfaces/IDataAdapter';
import TestDataAdapter from './TestDataAdapter';
// @ts-ignore
const statsig = statsigsdk.default;
const STORAGE_ADAPTER_KEY = 'statsig.cache';

describe('Validate functionality', () => {
  const serverKey = process.env.test_api_key;
  if (serverKey == null) {
    throw new Error('Invalid server key set');
  }
  // --> Project: "Statsig - evaluation test", "Kong" server key
  const dbNumber = 1;
  const dataAdapter = new TestDataAdapter();
  const statsigOptions = {
    dataAdapter: dataAdapter,
    environment: { tier: 'staging' },
  };
  const user = {
    userID: '12345',
    email: 'kenny@nfl.com',
    custom: { level: 9 },
  };

  async function loadStore() {
    // Manually load data into adapter store
    const gates: unknown[] = [];
    const configs: unknown[] = [];
    gates.push(exampleConfigSpecs.gate);
    configs.push(exampleConfigSpecs.config);
    const time = Date.now();
    await dataAdapter.initialize();
    await dataAdapter.set(
      STORAGE_ADAPTER_KEY,
      JSON.stringify({
        dynamic_configs: configs,
        feature_gates: gates,
        layer_configs: [],
        layers: [],
        has_updates: true,
      }),
      time,
    );
  }

  beforeEach(() => {
    statsig._instance = null;
  });

  afterEach(async () => {
    await dataAdapter.shutdown();
    await statsig.shutdown();
  });

  test('Verify that config specs can be fetched from adapter when network is down', async () => {
    await loadStore();

    const { result } = await dataAdapter.get(STORAGE_ADAPTER_KEY);
    if (result == null) {
      return;
    }

    // Initialize without network
    await statsig.initialize(serverKey, { localMode: true, ...statsigOptions });

    // Check gates
    const passesGate = await statsig.checkGate(user, 'nfl_gate');
    expect(passesGate).toEqual(true);

    // Check configs
    const config = await statsig.getConfig(
      user,
      exampleConfigSpecs.config.name,
    );
    expect(config.getValue('seahawks', null)).toEqual({
      name: 'Seattle Seahawks',
      yearFounded: 1974,
    });
  });

  test('Verify that adapter is updated when network response can be received', async () => {
    expect.assertions(2);

    // Initialize with network
    await statsig.initialize(serverKey, statsigOptions);

    const { result } = await dataAdapter.get(STORAGE_ADAPTER_KEY);
    if (result == null) {
      return;
    }
    const configSpecs = JSON.parse(result);

    // Check gates
    const gates = configSpecs['feature_gates'];
    if (gates == null) {
      return;
    }
    // @ts-ignore
    const gateToCheck = gates.find((gate) => gate.name === 'test_email_regex');
    expect(gateToCheck.defaultValue).toEqual(false);

    // Check configs
    const configs = configSpecs['dynamic_configs'];
    if (configs == null) {
      return;
    }
    // @ts-ignore
    const configToCheck = configs.find(
      (config) => config.name === 'test_custom_config',
    );
    expect(configToCheck.defaultValue).toEqual({
      header_text: 'new user test',
      foo: 'bar',
    });
  });

  test('Verify that using both bootstrap and adapter is properly handled', async () => {
    expect.assertions(2);

    await loadStore();

    const jsonResponse = {
      time: Date.now(),
      feature_gates: [],
      dynamic_configs: [],
      layer_configs: [],
      has_updates: true,
    };

    // Bootstrap with adapter
    await statsig.initialize(serverKey, {
      localMode: true,
      bootstrapValues: JSON.stringify(jsonResponse),
      ...statsigOptions,
    });

    const { result } = await dataAdapter.get(STORAGE_ADAPTER_KEY);
    if (result == null) {
      return;
    }
    const configSpecs = JSON.parse(result);

    // Check gates
    const gates = configSpecs['feature_gates'];
    if (gates == null) {
      return;
    }
    const expectedGates: unknown[] = [];
    expectedGates.push(exampleConfigSpecs.gate);
    expect(gates).toEqual(expectedGates);

    // Check configs
    const configs = configSpecs['dynamic_configs'];
    if (configs == null) {
      return;
    }
    const expectedConfigs: unknown[] = [];
    expectedConfigs.push(exampleConfigSpecs.config);
    expect(configs).toEqual(expectedConfigs);
  });

  test('Verify that single item fetching works', async () => {
    // Initialize with network
    await statsig.initialize(serverKey, statsigOptions);

    dataAdapter.set('feature_gates', 'test123');

    // Check id lists
    const { result: gates } = await dataAdapter.get('feature_gates');
    if (gates == null) {
      return;
    }
    expect(gates).toEqual('test123');
  });
});

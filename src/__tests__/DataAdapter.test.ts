import * as statsigsdk from '../index';
import exampleConfigSpecs from './jest.setup';
import TestDataAdapter from './TestDataAdapter';

jest.mock('node-fetch', () => jest.fn());
import fetch from 'node-fetch';

// @ts-ignore
const statsig = statsigsdk.default;
const STORAGE_ADAPTER_KEY = 'statsig.cache';

let isNetworkEnabled = false;

describe('DataAdapter', () => {
  // --> Project: "Statsig - evaluation test", "Kong" server key
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
    isNetworkEnabled = false;

    //@ts-ignore
    fetch.mockImplementation((url: string) => {
      if (url.includes('/download_config_specs') && isNetworkEnabled) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              JSON.stringify(require('./data/rulesets_e2e_full_dcs.json')),
            ),
        });
      }
      return Promise.reject();
    });
  });

  afterEach(async () => {
    await dataAdapter.shutdown();
  });

  describe('when statsig is initialized', () => {
    beforeEach(() => {
      statsig._instance = null;
    });

    afterEach(async () => {
      await statsig.shutdown();
    });

    it('fetches config specs from adapter when network is down', async () => {
      await loadStore();

      // Initialize without network
      await statsig.initialize('secret-key', {
        localMode: true,
        ...statsigOptions,
      });

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

    it('is updated when network response can be received', async () => {
      expect.assertions(2);

      isNetworkEnabled = true;
      // Initialize with network
      await statsig.initialize('secret-key', statsigOptions);

      const { result } = await dataAdapter.get(STORAGE_ADAPTER_KEY);
      const configSpecs = JSON.parse(result!);

      // Check gates
      const gates = configSpecs['feature_gates'];

      const gateToCheck = gates.find(
        (gate) => gate.name === 'test_email_regex',
      );
      expect(gateToCheck.defaultValue).toEqual(false);

      // Check configs
      const configs = configSpecs['dynamic_configs'];

      const configToCheck = configs.find(
        (config) => config.name === 'test_custom_config',
      );
      expect(configToCheck.defaultValue).toEqual({
        header_text: 'new user test',
        foo: 'bar',
      });
    });

    it('correctly handles bootstrap and adapter at the same time', async () => {
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
      await statsig.initialize('secret-key', {
        localMode: true,
        bootstrapValues: JSON.stringify(jsonResponse),
        ...statsigOptions,
      });

      const { result } = await dataAdapter.get(STORAGE_ADAPTER_KEY);
      const configSpecs = JSON.parse(result!);

      // Check gates
      const gates = configSpecs['feature_gates'];

      const expectedGates: unknown[] = [];
      expectedGates.push(exampleConfigSpecs.gate);
      expect(gates).toEqual(expectedGates);

      // Check configs
      const configs = configSpecs['dynamic_configs'];

      const expectedConfigs: unknown[] = [];
      expectedConfigs.push(exampleConfigSpecs.config);
      expect(configs).toEqual(expectedConfigs);
    });
  });

  it('fetches single items', async () => {
    await statsig.initialize('secret-key', statsigOptions);

    dataAdapter.set('feature_gates', 'test123');

    // Check id lists
    const { result: gates } = await dataAdapter.get('feature_gates');

    expect(gates).toEqual('test123');
  });
});

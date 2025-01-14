import fetch from 'node-fetch';

import * as statsigsdk from '../index';
import { getDataAdapterKey, IDataAdapter } from '../interfaces/IDataAdapter';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { checkGateAssertion } from '../test_utils/CheckGateTestUtils';
import { GatesForIdListTest } from './BootstrapWithDataAdapter.data';
import exampleConfigSpecs from './jest.setup';
import StatsigTestUtils from './StatsigTestUtils';
import TestDataAdapter, {
  TestObjectDataAdapter,
  TestSyncingDataAdapter,
} from './TestDataAdapter';
import { sha256HashBase64 } from '../utils/Hashing';
import { DataAdapterKeyPath } from '../../dist';

jest.mock('node-fetch', () => jest.fn());

// @ts-ignore
const statsig = statsigsdk.default;

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
  const sdkKey = 'secret-key';
  const hashedKey = sha256HashBase64(sdkKey);
  const dataAdapterKey = getDataAdapterKey(
    hashedKey,
    DataAdapterKeyPath.V1Rulesets,
  );
  const idlistDataAdapterKey = getDataAdapterKey(
    hashedKey,
    DataAdapterKeyPath.V1IDLists,
  );

  async function loadStore(dataAdapter: IDataAdapter) {
    // Manually load data into adapter store
    let gates: unknown[] = [];
    const configs: unknown[] = [];
    gates.push(exampleConfigSpecs.gate);
    gates = gates.concat(GatesForIdListTest);
    configs.push(exampleConfigSpecs.config);
    const time = Date.now();
    await dataAdapter.initialize();
    await dataAdapter.set(
      dataAdapterKey,
      JSON.stringify({
        dynamic_configs: configs,
        feature_gates: gates,
        layer_configs: [],
        layers: [],
        has_updates: true,
      }),
      time,
    );
    await dataAdapter.set(idlistDataAdapterKey, '["user_id_list"]');
    await dataAdapter.set(
      getDataAdapterKey(
        hashedKey,
        DataAdapterKeyPath.IDList,
        'plain_text',
        'user_id_list',
      ),
      '+Z/hEKLio\n+M5m6a10x\n',
    );
  }

  beforeEach(() => {
    isNetworkEnabled = false;

    //@ts-ignore
    fetch.mockImplementation((url: string) => {
      if (!isNetworkEnabled) {
        return Promise.reject();
      }

      if (url.includes('/download_config_specs')) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              JSON.stringify(require('./data/rulesets_e2e_full_dcs.json')),
            ),
        });
      }

      if (url.includes('/get_id_lists')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user_id_list: {
                name: 'user_id_list',
                size: 20,
                url: 'https://fake.com/an_id_list_url',
                creationTime: 1666625173000,
                fileID: '1wkGp3X5k3mIQQR85D887n',
              },
            }),
        });
      }

      if (url.includes('https://fake.com/an_id_list_url')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(['+Z/hEKLio', '+M5m6a10x'].join('\n')),
          headers: {
            get: jest.fn((v) => {
              if (v.toLowerCase() === 'content-length') {
                return 20;
              }
            }),
          },
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
      StatsigInstanceUtils.setInstance(null);
    });

    afterEach(async () => {
      await statsig.shutdown();
    });

    it('fetches config specs from adapter when network is down', async () => {
      await loadStore(dataAdapter);

      // Initialize without network
      await statsig.initialize(sdkKey, {
        localMode: true,
        ...statsigOptions,
      });

      // Check gates
      await checkGateAssertion(statsig, user, 'nfl_gate', true);

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

    it('updates config specs when with newer network values', async () => {
      expect.assertions(3);

      isNetworkEnabled = true;
      // Initialize with network
      await statsig.initialize(sdkKey, statsigOptions);
      const { result } = await dataAdapter.get(dataAdapterKey);
      expect(result).not.toBeUndefined();
      const configSpecs = JSON.parse(result as string);

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

    it('updates id lists when with newer network values', async () => {
      isNetworkEnabled = true;
      await statsig.initialize(sdkKey, statsigOptions);

      const lookup = await dataAdapter.get(idlistDataAdapterKey);
      expect(lookup.result).toEqual(
        '{"user_id_list":{"name":"user_id_list","size":20,"url":"https://fake.com/an_id_list_url","creationTime":1666625173000,"fileID":"1wkGp3X5k3mIQQR85D887n"}}',
      );

      const ids = await dataAdapter.get(
        getDataAdapterKey(
          hashedKey,
          DataAdapterKeyPath.IDList,
          'plain_text',
          'user_id_list',
        ),
      );
      expect(ids.result).toEqual('+Z/hEKLio\n+M5m6a10x\n');
    });

    it('correctly handles bootstrap and adapter at the same time', async () => {
      expect.assertions(3);

      await loadStore(dataAdapter);

      const jsonResponse = {
        time: Date.now(),
        feature_gates: [],
        dynamic_configs: [],
        layer_configs: [],
        has_updates: true,
      };

      // Bootstrap with adapter
      await statsig.initialize(sdkKey, {
        localMode: true,
        bootstrapValues: JSON.stringify(jsonResponse),
        ...statsigOptions,
      });

      const { result } = await dataAdapter.get(dataAdapterKey);
      expect(result).not.toBeUndefined();
      const configSpecs = JSON.parse(result as string);

      // Check gates
      const gates = configSpecs['feature_gates'];

      let expectedGates: unknown[] = [];
      expectedGates.push(exampleConfigSpecs.gate);
      expectedGates = expectedGates.concat(GatesForIdListTest);
      expect(gates).toEqual(expectedGates);

      // Check configs
      const configs = configSpecs['dynamic_configs'];

      const expectedConfigs: unknown[] = [];
      expectedConfigs.push(exampleConfigSpecs.config);
      expect(configs).toEqual(expectedConfigs);
    });
  });

  it('fetches single items', async () => {
    await statsig.initialize(sdkKey, statsigOptions);

    dataAdapter.set('feature_gates', 'test123');

    // Check id lists
    const { result: gates } = await dataAdapter.get('feature_gates');

    expect(gates).toEqual('test123');
  });

  describe('when data adapter is used for syncing for rulesets', () => {
    const syncingDataAdapter = new TestSyncingDataAdapter([
      DataAdapterKeyPath.V1Rulesets,
    ]);
    beforeEach(() => {
      StatsigInstanceUtils.setInstance(null);
    });

    afterEach(async () => {
      await statsig.shutdown();
    });

    it('updates config specs when adapter config spec update', async () => {
      // Initialize without network
      await statsig.initialize(sdkKey, {
        localMode: true,
        dataAdapter: syncingDataAdapter,
        environment: { tier: 'staging' },
      });

      // Check gates
      await checkGateAssertion(statsig, user, 'nfl_gate', false);

      // Check configs
      const config1 = await statsig.getConfig(
        user,
        exampleConfigSpecs.config.name,
      );
      expect(config1.getValue('seahawks', null)).toEqual(null);

      await loadStore(syncingDataAdapter);

      const evaluator = StatsigTestUtils.getEvaluator();
      evaluator.store.rulesetsSyncInterval = 1000;
      evaluator.store.rulesetsSyncTimer = null;
      evaluator.store.pollForUpdates();
      await new Promise((_) => setTimeout(_, 1100));

      // Check gates after syncing
      await checkGateAssertion(statsig, user, 'nfl_gate', true);

      // Check configs after syncing
      const config2 = await statsig.getConfig(
        user,
        exampleConfigSpecs.config.name,
      );
      expect(config2.getValue('seahawks', null)).toEqual({
        name: 'Seattle Seahawks',
        yearFounded: 1974,
      });
    });

    it('updates config specs from adapter when manually sync', async () => {
      // Initialize without network
      await statsig.initialize(sdkKey, {
        localMode: true,
        dataAdapter: syncingDataAdapter,
        environment: { tier: 'staging' },
        disableRulesetsSync: true,
        disableIdListsSync: true,
      });

      // Check gates
      const passesGate1 = await statsig.checkGate(user, 'nfl_gate');
      expect(passesGate1).toEqual(false);

      // Check configs
      const config1 = await statsig.getConfig(
        user,
        exampleConfigSpecs.config.name,
      );
      expect(config1.getValue('seahawks', null)).toEqual(null);

      await loadStore(syncingDataAdapter);

      // Manually sync store
      await statsig.syncConfigSpecs();

      // Check gates after syncing
      const passesGate2 = await statsig.checkGate(user, 'nfl_gate');
      expect(passesGate2).toEqual(true);

      // Check configs after syncing
      const config2 = await statsig.getConfig(
        user,
        exampleConfigSpecs.config.name,
      );
      expect(config2.getValue('seahawks', null)).toEqual({
        name: 'Seattle Seahawks',
        yearFounded: 1974,
      });
    });

    it('still initializes id lists from the network', async () => {
      isNetworkEnabled = true;
      const time = Date.now();
      await syncingDataAdapter.initialize();
      await syncingDataAdapter.set(
        dataAdapterKey,
        JSON.stringify({
          dynamic_configs: [],
          feature_gates: GatesForIdListTest,
          layer_configs: [],
          layers: [],
          has_updates: true,
        }),
        time,
      );

      await statsig.initialize(sdkKey, {
        dataAdapter: syncingDataAdapter,
        environment: { tier: 'staging' },
      });

      await checkGateAssertion(
        statsig,
        { userID: 'a-user' },
        'test_id_list',
        true,
      );

      await checkGateAssertion(
        statsig,
        { userID: 'b-user' },
        'test_id_list',
        true,
      );

      await checkGateAssertion(
        statsig,
        { userID: 'c-user' },
        'test_id_list',
        false,
      );
    });
  });

  describe('when data adapter is used for syncing for rulesets and id lists', () => {
    const syncingDataAdapter = new TestSyncingDataAdapter([
      DataAdapterKeyPath.V1IDLists,
      DataAdapterKeyPath.V1Rulesets,
    ]);
    beforeEach(() => {
      StatsigInstanceUtils.setInstance(null);
    });

    afterEach(async () => {
      await statsig.shutdown();
    });

    it('updates config specs and id lists when adapter config spec update', async () => {
      // Initialize without network
      await statsig.initialize(sdkKey, {
        localMode: true,
        dataAdapter: syncingDataAdapter,
        environment: { tier: 'staging' },
      });

      // Check gates
      await checkGateAssertion(
        statsig,
        { userID: 'a-user' },
        'test_id_list',
        false,
      );

      await checkGateAssertion(
        statsig,
        { userID: 'b-user' },
        'test_id_list',
        false,
      );

      await checkGateAssertion(
        statsig,
        { userID: 'c-user' },
        'test_id_list',
        false,
      );

      // Check configs
      const config1 = await statsig.getConfig(
        user,
        exampleConfigSpecs.config.name,
      );
      expect(config1.getValue('seahawks', null)).toEqual(null);

      const time = Date.now();
      await syncingDataAdapter.initialize();
      await syncingDataAdapter.set(
        dataAdapterKey,
        JSON.stringify({
          dynamic_configs: [exampleConfigSpecs.config],
          feature_gates: GatesForIdListTest,
          layer_configs: [],
          layers: [],
          has_updates: true,
        }),
        time,
      );
      syncingDataAdapter.set(idlistDataAdapterKey, '["user_id_list"]');
      syncingDataAdapter.set(
        getDataAdapterKey(
          hashedKey,
          DataAdapterKeyPath.IDList,
          'plain_text',
          'user_id_list',
        ),
        '+Z/hEKLio\n+M5m6a10x\n',
      );

      const evaluator = StatsigTestUtils.getEvaluator();
      evaluator.store.rulesetsSyncInterval = 1000;
      evaluator.store.idListsSyncInterval = 1000;
      evaluator.store.rulesetsSyncTimer = null;
      evaluator.store.idListsSyncTimer = null;
      evaluator.store.pollForUpdates();
      await new Promise((_) => setTimeout(_, 1100));

      // Check gates after syncing
      await checkGateAssertion(
        statsig,
        { userID: 'a-user' },
        'test_id_list',
        true,
      );

      await checkGateAssertion(
        statsig,
        { userID: 'b-user' },
        'test_id_list',
        true,
      );

      await checkGateAssertion(
        statsig,
        { userID: 'c-user' },
        'test_id_list',
        false,
      );

      // Check configs after syncing
      const config2 = await statsig.getConfig(
        user,
        exampleConfigSpecs.config.name,
      );
      expect(config2.getValue('seahawks', null)).toEqual({
        name: 'Seattle Seahawks',
        yearFounded: 1974,
      });
    });
  });

  describe('when data adapter returns a raw object', () => {
    const dataAdapter = new TestObjectDataAdapter();

    beforeEach(() => {
      StatsigInstanceUtils.setInstance(null);
    });

    afterEach(async () => {
      statsig.shutdown();
    });

    it('fetches config specs from adapter when network is down', async () => {
      await loadStore(dataAdapter);

      // Initialize without network
      await statsig.initialize(sdkKey, {
        localMode: true,
        ...statsigOptions,
        dataAdapter,
      });

      // Check gates
      await checkGateAssertion(statsig, user, 'nfl_gate', true);

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

    it('fetches id lists from adapter when network is down', async () => {
      await loadStore(dataAdapter);

      // Initialize without network
      await statsig.initialize(sdkKey, {
        localMode: true,
        ...statsigOptions,
        dataAdapter,
      });

      // Check gates
      await checkGateAssertion(
        statsig,
        { userID: 'a-user' },
        'test_id_list',
        true,
      );
    });
  });
});

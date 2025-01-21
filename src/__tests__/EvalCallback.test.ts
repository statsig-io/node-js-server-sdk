import Statsig, { DynamicConfig, FeatureGate, Layer } from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/download_config_specs_group_name_test.json'),
);

describe('Eval Callback', () => {
  let gateCount = 0;
  let configCount = 0;
  let experimentCount = 0;
  let layerCount = 0;
  beforeEach(async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
      });
    });
    gateCount = 0;
    configCount = 0;
    layerCount = 0;
    StatsigInstanceUtils.setInstance(null);
    await Statsig.initialize('secret-key', {
      disableDiagnostics: true,
      evaluationCallback: (config) => {
        if (config instanceof DynamicConfig) {
          configCount++;
        } else if (config instanceof Layer) {
          layerCount++;
        } else {
          gateCount++;
        }
      },
    });
  });

  describe('getFeatureGate', () => {
    it('Calls callback when gate found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getFeatureGate(user, 'test_many_rules');
      expect(gateCount).toBe(1);
    });

    it('Calls callback when gate not found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getFeatureGate(user, 'not_a_valid_gate');
      expect(gateCount).toBe(1);
    });

    it('Calls callback for checkGate', async () => {
      const user = { userID: 'a-user' };
      Statsig.checkGate(user, 'test_many_rules');
      expect(gateCount).toBe(1);
    });
  });

  describe('getConfig', () => {
    it('Calls callback when config found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getConfig(user, 'disabled_config');
      expect(configCount).toBe(1);
    });

    it('Calls callback when config not found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getConfig(user, 'fake_config');
      expect(configCount).toBe(1);
    });
  });

  describe('getExperiment', () => {
    it('Calls callback when experiment found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getExperiment(user, 'experiment_with_many_params');
      expect(configCount).toBe(1);
    });

    it('Calls callback when experiment not found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getExperiment(user, 'fake_exp');
      expect(configCount).toBe(1);
    });
  });

  describe('getLayer', () => {
    it('Calls callback when layer found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getLayer(user, 'layer_with_many_params');
      expect(layerCount).toBe(1);
    });

    it('Calls callback when layer not found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getLayer(user, 'fake_layer');
      expect(layerCount).toBe(1);
    });
  });
});

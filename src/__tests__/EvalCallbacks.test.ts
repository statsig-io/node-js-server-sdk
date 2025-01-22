import Statsig, { DynamicConfig, FeatureGate, Layer } from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/download_config_specs_group_name_test.json'),
);

describe('Eval Callbacks', () => {
  let gateCount = 0;
  let configCount = 0;
  let experimentCount = 0;
  let layerCount = 0;
  let layerParamCount = 0;
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
    experimentCount = 0;
    layerCount = 0;
    layerParamCount = 0;
    StatsigInstanceUtils.setInstance(null);
    await Statsig.initialize('secret-key', {
      disableDiagnostics: true,
      evaluationCallbacks: {
        gateCallback: (gate, user, event) => {
          gateCount++;
        },
        dynamicConfigCallback: (config, user, event) => {
          configCount++;
        },
        experimentCallback: (config, user, event) => {
          experimentCount++;
        },
        layerCallback: (layer, user) => {
          layerCount++;
        },
        layerParamCallback(layer, paramName, user, event) {
          layerParamCount++;
        },
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
      expect(experimentCount).toBe(1);
    });

    it('Calls callback when experiment not found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getExperiment(user, 'fake_exp');
      expect(experimentCount).toBe(1);
    });
  });

  describe('getLayer', () => {
    it('Calls callback when layer found', async () => {
      const user = { userID: 'a-user' };
      const layer = Statsig.getLayer(user, 'layer_with_many_params');
      expect(layerCount).toBe(1);
      layer.get('a_string', '');
      expect(layerParamCount).toBe(1);
    });

    it('Calls callback when layer not found', async () => {
      const user = { userID: 'a-user' };
      Statsig.getLayer(user, 'fake_layer');
      expect(layerCount).toBe(1);
    });
  });
});

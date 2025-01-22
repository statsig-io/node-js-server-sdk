import Statsig, { StatsigUser } from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { parseLogEvents } from './StatsigTestUtils';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/exposure_logging_dcs.json'),
);

const user: StatsigUser = {
  userID: 'a-user',
};

describe('ExposureLogging', () => {
  let events: {
    eventName: string;
    metadata: { gate?: string; config?: string; isManualExposure?: string };
    user: StatsigUser | null;
    value: string | number | null;
  }[] = [];

  beforeEach(async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
        });
      }

      if (url.includes('log_event')) {
        events = events.concat(parseLogEvents(params)['events']);
        return Promise.resolve({
          ok: true,
        });
      }

      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });

    events = [];

    StatsigInstanceUtils.setInstance(null);
    await Statsig.initialize('secret-key', { disableDiagnostics: true });
  });

  describe('standard use', () => {
    it('logs check gate exposures', async () => {
      await Statsig.checkGate(user, 'a_gate');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.gate).toEqual('a_gate');
      expect(events[0].metadata.isManualExposure).toBeUndefined();
      expect(events[0].eventName).toEqual('statsig::gate_exposure');
    });

    it('logs get feature gate exposures', async () => {
      Statsig.getFeatureGate(user, 'b_gate');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.gate).toEqual('b_gate');
      expect(events[0].metadata.isManualExposure).toBeUndefined();
      expect(events[0].eventName).toEqual('statsig::gate_exposure');
    });

    it('logs config exposures', async () => {
      await Statsig.getConfig(user, 'a_config');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.config).toEqual('a_config');
      expect(events[0].metadata.isManualExposure).toBeUndefined();
      expect(events[0].eventName).toEqual('statsig::config_exposure');
    });

    it('logs experiment exposures', async () => {
      await Statsig.getExperiment(user, 'an_experiment');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.config).toEqual('an_experiment');
      expect(events[0].metadata.isManualExposure).toBeUndefined();
      expect(events[0].eventName).toEqual('statsig::config_exposure');
    });

    it('logs layer exposures', async () => {
      const layer = await Statsig.getLayer(user, 'a_layer');
      layer.get('a_bool', false);
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.config).toEqual('a_layer');
      expect(events[0].metadata.isManualExposure).toBeUndefined();
      expect(events[0].eventName).toEqual('statsig::layer_exposure');
    });
  });

  describe('exposure logging disabled', () => {
    it('does not log check gate exposures', async () => {
      Statsig.checkGateWithExposureLoggingDisabled(user, 'a_gate');
      expect(events.length).toBe(0);
    });

    it('does not log get gate exposures', async () => {
      Statsig.getFeatureGateWithExposureLoggingDisabled(user, 'b_gate');
      expect(events.length).toBe(0);
    });

    it('does not log config exposures', async () => {
      Statsig.getConfigWithExposureLoggingDisabled(user, 'a_config');
      expect(events.length).toBe(0);
    });

    it('does not log experiment exposures', async () => {
      Statsig.getExperimentWithExposureLoggingDisabled(user, 'an_experiment');
      expect(events.length).toBe(0);
    });

    it('does not log layer exposures', async () => {
      const layer = await Statsig.getLayerWithExposureLoggingDisabled(
        user,
        'a_layer',
      );
      layer.get('a_bool', false);
      expect(events.length).toBe(0);
    });
  });

  describe('Does not log with exposure disabled ', () => {
    it('Verify checkGate, getConfig, getExperiment, getLayer disable exposure with option', async () => {
      const user = { userID: '123' };
      const disableExposureOption = {disableExposureLogging: true};
      Statsig.getFeatureGate(user, 'b_gate', disableExposureOption);
      Statsig.checkGate(user, 'a_gate', disableExposureOption);
      Statsig.getConfig(user, 'a_config', disableExposureOption)
      
      const layer = Statsig.getLayer(
        user,
        'a_layer',
        disableExposureOption
      );
      layer.get('a_bool', false);

      await Statsig.flush();

      expect(events).toHaveLength(0); 
      events = []
      const enableExposureOption = { disableExposureLogging: false };
      Statsig.getFeatureGate(user, 'b_gate', enableExposureOption);
      Statsig.checkGate(user, 'a_gate', enableExposureOption);
      Statsig.getConfig(user, 'a_config', enableExposureOption)
      
      const layer_1 = Statsig.getLayer(
        user,
        'a_layer',
        enableExposureOption
      );
      layer_1.get('a_bool', false);

      await Statsig.flush();

      expect(events).toHaveLength(4);
      expect(events[0].eventName).toEqual('statsig::gate_exposure');
      expect(events[1].eventName).toEqual('statsig::gate_exposure');
      expect(events[2].eventName).toEqual('statsig::config_exposure');
      expect(events[3].eventName).toEqual('statsig::layer_exposure');
    });
  })

  describe('logging with bad inputs', () => {
    it('event with invalid event name does not get logged', async () => {
      const user: StatsigUser = { userID: '123' };
      Statsig.logEvent(user, '');
      await Statsig.flush();
      expect(events.length).toBe(0);
    });
    it('null user gets logged as empty user', async () => {
      //@ts-ignore
      const user: StatsigUser = null;
      Statsig.logEvent(user, 'foo');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].user).toEqual({
        customIDs: {},
        privateAttributes: null,
      });
    });
    it('invalid user object gets logged as null', async () => {
      //@ts-ignore
      const user: StatsigUser = 'user';
      Statsig.logEvent(user, 'foo');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].user).toEqual(null);
    });
    it('user object too large still logged', async () => {
      const user: StatsigUser = {
        userID: '1'.repeat(4096),
      };
      Statsig.logEvent(user, 'foo');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].user).toEqual({
        ...user,
        privateAttributes: null,
      });
    });
    it('metadata object too large still logged', async () => {
      const user: StatsigUser = { userID: '123' };
      const metadata = {
        bigString: '1'.repeat(4096),
      };
      Statsig.logEvent(user, 'foo', undefined, metadata);
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata).toEqual(metadata);
    });
    it('value too large still logged', async () => {
      const user: StatsigUser = { userID: '123' };
      const value = '1'.repeat(4096);
      Statsig.logEvent(user, 'foo', value);
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].value).toEqual(value);
    });
  });

  describe('manual exposure logging', () => {
    it('logs a manual gate exposure', async () => {
      Statsig.manuallyLogGateExposure(user, 'a_gate');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.gate).toEqual('a_gate');
      expect(events[0].metadata.isManualExposure).toEqual('true');
      expect(events[0].eventName).toEqual('statsig::gate_exposure');
    });

    it('logs a manual config exposure', async () => {
      Statsig.manuallyLogConfigExposure(user, 'a_config');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.config).toEqual('a_config');
      expect(events[0].metadata.isManualExposure).toEqual('true');
      expect(events[0].eventName).toEqual('statsig::config_exposure');
    });

    it('logs a manual experiment exposure', async () => {
      Statsig.manuallyLogExperimentExposure(user, 'an_experiment');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.config).toEqual('an_experiment');
      expect(events[0].metadata.isManualExposure).toEqual('true');
      expect(events[0].eventName).toEqual('statsig::config_exposure');
    });

    it('logs a manual layer exposure', async () => {
      Statsig.manuallyLogLayerParameterExposure(user, 'a_layer', 'a_bool');
      await Statsig.flush();
      expect(events.length).toBe(1);
      expect(events[0].metadata.config).toEqual('a_layer');
      expect(events[0].metadata.isManualExposure).toEqual('true');
      expect(events[0].eventName).toEqual('statsig::layer_exposure');
    });

    it('get experiment layer does not log exposure', async () => {
      const layerName = Statsig.getExperimentLayer('sample_experiment');
      await Statsig.flush();
      expect(events.length).toBe(0);
      expect(layerName).toEqual('a_layer');
    });
  });
});

import { StatsigUser } from './StatsigUser';
import DynamicConfig from './DynamicConfig';
import Layer from './Layer';
import StatsigServer from './StatsigServer';
import { StatsigOptionsType } from './StatsigOptionsType';

const statsig = {
  _instance: null,

  initialize(
    secretKey: string,
    options: StatsigOptionsType = {},
  ): Promise<void> {
    if (statsig._instance == null) {
      statsig._instance = new StatsigServer(secretKey, options);
    }
    return statsig._instance.initializeAsync();
  },

  checkGate(user: StatsigUser, gateName: string): Promise<boolean> {
    statsig._ensureInitialized();
    return statsig._instance.checkGate(user, gateName);
  },

  getConfig(user: StatsigUser, configName: string): Promise<DynamicConfig> {
    statsig._ensureInitialized();
    return statsig._instance.getConfig(user, configName);
  },

  getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    statsig._ensureInitialized();
    return statsig._instance.getExperiment(user, experimentName);
  },

  getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    statsig._ensureInitialized();
    return statsig._instance.getLayer(user, layerName);
  },

  logEvent(
    user: StatsigUser,
    eventName: string,
    value: string | number | null = null,
    metadata: Record<string, unknown> | null = null,
  ): void {
    statsig._ensureInitialized();
    statsig._instance.logEvent(user, eventName, value, metadata);
  },

  logEventObject(eventObject: {
    eventName: string;
    user: StatsigUser;
    value?: string | number | null;
    metadata?: Record<string, unknown>;
    time?: string | null;
  }): void {
    statsig._ensureInitialized();
    statsig._instance.logEventObject(eventObject);
  },

  shutdown(): void {
    statsig._ensureInitialized();
    statsig._instance.shutdown();
  },

  getClientInitializeResponse(
    user: StatsigUser,
  ): Record<string, unknown> | null {
    statsig._ensureInitialized();
    return statsig._instance.getClientInitializeResponse(user);
  },

  overrideGate(gateName: string, value: boolean, userID: string = ''): void {
    statsig._ensureInitialized();
    statsig._instance.overrideGate(gateName, value, userID);
  },

  overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userID: string = '',
  ): void {
    statsig._ensureInitialized();
    statsig._instance.overrideConfig(configName, value, userID);
  },

  _ensureInitialized(): void {
    if (statsig._instance == null) {
      throw new Error('Must call initialize() first.');
    }
  },
};

module.exports = statsig;

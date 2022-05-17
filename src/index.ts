import { StatsigUser } from './StatsigUser';
import DynamicConfig from './DynamicConfig';
import Layer from './Layer';
import StatsigServer from './StatsigServer';
import { StatsigOptionsType } from './StatsigOptionsType';

type StatsigSingleton = {
  _instance: null | StatsigServer;

  initialize(secretKey: string, options?: StatsigOptionsType): Promise<void>;

  checkGate(user: StatsigUser, gateName: string): Promise<boolean>;

  getConfig(user: StatsigUser, configName: string): Promise<DynamicConfig>;

  getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig>;

  getLayer(user: StatsigUser, layerName: string): Promise<Layer>;

  logEvent(
    user: StatsigUser,
    eventName: string,
    value?: string | number | null,
    metadata?: Record<string, unknown> | null,
  ): void;

  logEventObject(eventObject: {
    eventName: string;
    user: StatsigUser;
    value?: string | number | null;
    metadata?: Record<string, unknown>;
    time?: string | null;
  }): void;

  shutdown(): void;

  getClientInitializeResponse(
    user: StatsigUser,
  ): Record<string, unknown> | null;

  overrideGate(gateName: string, value: boolean, userID?: string): void;

  overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userID?: string,
  ): void;

  flush(): Promise<void>;

  _ensureInitialized(): StatsigServer;
};

const statsig: StatsigSingleton = {
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
    const server = statsig._ensureInitialized();
    return server.checkGate(user, gateName);
  },

  getConfig(user: StatsigUser, configName: string): Promise<DynamicConfig> {
    const server = statsig._ensureInitialized();
    return server.getConfig(user, configName);
  },

  getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    const server = statsig._ensureInitialized();
    return server.getExperiment(user, experimentName);
  },

  getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    const server = statsig._ensureInitialized();
    return server.getLayer(user, layerName);
  },

  logEvent(
    user: StatsigUser,
    eventName: string,
    value: string | number | null = null,
    metadata: Record<string, unknown> | null = null,
  ): void {
    const server = statsig._ensureInitialized();
    server.logEvent(user, eventName, value, metadata);
  },

  logEventObject(eventObject: {
    eventName: string;
    user: StatsigUser;
    value?: string | number | null;
    metadata?: Record<string, unknown>;
    time?: string | null;
  }): void {
    const server = statsig._ensureInitialized();
    server.logEventObject(eventObject);
  },

  shutdown(): void {
    const server = statsig._ensureInitialized();
    server.shutdown();
  },

  getClientInitializeResponse(
    user: StatsigUser,
  ): Record<string, unknown> | null {
    const server = statsig._ensureInitialized();
    return server.getClientInitializeResponse(user);
  },

  overrideGate(gateName: string, value: boolean, userID: string = ''): void {
    const server = statsig._ensureInitialized();
    server.overrideGate(gateName, value, userID);
  },

  overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userID: string = '',
  ): void {
    const server = statsig._ensureInitialized();
    server.overrideConfig(configName, value, userID);
  },

  flush(): Promise<void> {
    if (statsig._instance == null) {
      return Promise.resolve();
    }
    return statsig._instance.flush();
  },

  _ensureInitialized(): StatsigServer {
    if (statsig._instance == null) {
      throw new Error('Must call initialize() first.');
    }
    return statsig._instance;
  },
};

module.exports = statsig;

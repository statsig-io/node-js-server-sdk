import DynamicConfig from './DynamicConfig';
import { StatsigUninitializedError } from './Errors';
import { AdapterResponse, IDataAdapter } from './interfaces/IDataAdapter';
import Layer from './Layer';
import {
  RulesUpdatedCallback,
  StatsigEnvironment,
  StatsigOptions,
} from './StatsigOptions';

import StatsigServer, { LogEventObject } from './StatsigServer';
import { StatsigUser } from './StatsigUser';

export {
  DynamicConfig,
  Layer,
  LogEventObject,
  RulesUpdatedCallback,
  StatsigUser,
  StatsigOptions,
  StatsigEnvironment,
  IDataAdapter,
  AdapterResponse,
};

const Statsig = {
  _instance: null as StatsigServer | null,

  initialize(secretKey: string, options: StatsigOptions = {}): Promise<void> {
    const inst = Statsig._instance ?? new StatsigServer(secretKey, options);

    if (Statsig._instance == null) {
      Statsig._instance = inst;
    }

    return inst.initializeAsync();
  },

  checkGate(user: StatsigUser, gateName: string): Promise<boolean> {
    const server = Statsig._ensureInitialized();
    return server.checkGate(user, gateName);
  },

  getConfig(user: StatsigUser, configName: string): Promise<DynamicConfig> {
    const server = Statsig._ensureInitialized();
    return server.getConfig(user, configName);
  },

  getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    const server = Statsig._ensureInitialized();
    return server.getExperiment(user, experimentName);
  },

  getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    const server = Statsig._ensureInitialized();
    return server.getLayer(user, layerName);
  },

  logEvent(
    user: StatsigUser,
    eventName: string,
    value: string | number | null = null,
    metadata: Record<string, unknown> | null = null,
  ): void {
    const server = Statsig._ensureInitialized();
    server.logEvent(user, eventName, value, metadata);
  },

  logEventObject(eventObject: {
    eventName: string;
    user: StatsigUser;
    value?: string | number | null;
    metadata?: Record<string, unknown>;
    time?: string | null;
  }): void {
    const server = Statsig._ensureInitialized();
    server.logEventObject(eventObject);
  },

  shutdown(): void {
    const server = Statsig._ensureInitialized();
    server.shutdown();
  },

  getClientInitializeResponse(
    user: StatsigUser,
  ): Record<string, unknown> | null {
    const server = Statsig._ensureInitialized();
    return server.getClientInitializeResponse(user);
  },

  overrideGate(gateName: string, value: boolean, userID: string = ''): void {
    const server = Statsig._ensureInitialized();
    server.overrideGate(gateName, value, userID);
  },

  overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userID: string = '',
  ): void {
    const server = Statsig._ensureInitialized();
    server.overrideConfig(configName, value, userID);
  },

  flush(): Promise<void> {
    const inst = Statsig._instance;
    if (inst == null) {
      return Promise.resolve();
    }
    return inst.flush();
  },

  _ensureInitialized(): StatsigServer {
    if (Statsig._instance == null) {
      throw new StatsigUninitializedError();
    }
    return Statsig._instance;
  },
};

type Statsig = Omit<typeof Statsig, '_instance'>;
export default Statsig as Statsig;
module.exports = Statsig as Statsig;

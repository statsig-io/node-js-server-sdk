import DynamicConfig from './DynamicConfig';
import {
  StatsigInvalidArgumentError,
  StatsigLocalModeNetworkError,
  StatsigTooManyRequestsError,
  StatsigUninitializedError,
} from './Errors';
import { ClientInitializeResponse } from './Evaluator';
import { FeatureGate } from './FeatureGate';
import {
  AdapterResponse,
  DataAdapterKey,
  IDataAdapter,
} from './interfaces/IDataAdapter';
import Layer from './Layer';
import OutputLogger from './OutputLogger';
import StatsigInstanceUtils from './StatsigInstanceUtils';
import {
  InitStrategy,
  RulesUpdatedCallback,
  StatsigEnvironment,
  StatsigOptions,
} from './StatsigOptions';
import StatsigServer, {
  ClientInitializeResponseOptions,
  LogEventObject,
} from './StatsigServer';
import { StatsigUser } from './StatsigUser';

export type {
  AdapterResponse,
  InitStrategy,
  LogEventObject,
  RulesUpdatedCallback,
  StatsigEnvironment,
  StatsigOptions,
  StatsigUser,
};

export { DynamicConfig, IDataAdapter, DataAdapterKey, Layer, StatsigServer };

// These need to be exported, and we currently export a top level Statsig object
// So in order to not make a breaking change, they must be exported as members of
// that top level object
const EXPORTS = {
  DynamicConfig,
  Layer,
  StatsigInvalidArgumentError,
  StatsigLocalModeNetworkError,
  StatsigTooManyRequestsError,
  StatsigUninitializedError,
};

export const Statsig = {
  ...EXPORTS,

  /**
   * Initializes the statsig server SDK.
   * This must be called before checking gates/configs or logging events.
   *
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {?StatsigOptions} [options={}] - manual sdk configuration for advanced setup
   * @returns {Promise<void>} - a promise which rejects only if you fail to provide a proper SDK Key
   * @throws Error if a Server Secret Key is not provided
   */
  async initialize(
    secretKey: string,
    options: StatsigOptions = {},
  ): Promise<void> {
    if (options.logger) {
      OutputLogger.setLogger(options.logger);
    }

    const inst =
      StatsigInstanceUtils.getInstance() ??
      new StatsigServer(secretKey, options);

    if (StatsigInstanceUtils.getInstance() == null) {
      StatsigInstanceUtils.setInstance(inst);
    }

    try {
      return await inst.initializeAsync();
    } catch (e) {
      StatsigInstanceUtils.setInstance(null);
      return Promise.reject(e);
    }
  },

  /**
   * Gets the boolean result of a gate, evaluated against the given user.
   * An exposure event will automatically be logged for the gate.
   *
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {boolean} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   */
  checkGateSync(user: StatsigUser, gateName: string): boolean {
    return this._enforceServer().checkGateSync(user, gateName);
  },

  getFeatureGateSync(user: StatsigUser, gateName: string): FeatureGate {
    return this._enforceServer().getFeatureGateSync(user, gateName);
  },

  /**
   * Gets the boolean result of a gate, evaluated against the given user.
   * No exposure event will be logged.
   *
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {boolean} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   */
  checkGateWithExposureLoggingDisabledSync(
    user: StatsigUser,
    gateName: string,
  ): boolean {
    return this._enforceServer().checkGateWithExposureLoggingDisabledSync(
      user,
      gateName,
    );
  },

  getFeatureGateWithExposureLoggingDisabledSync(
    user: StatsigUser,
    gateName: string,
  ): FeatureGate {
    return this._enforceServer().getFeatureGateWithExposureLoggingDisabledSync(
      user,
      gateName,
    );
  },

  /**
   * Logs an exposure event for the gate
   *
   * @param {StatsigUser} user - the user to log the exposure against
   * @param {string} gateName - the name of the gate to expose
   */
  manuallyLogGateExposure(user: StatsigUser, gateName: string) {
    return this._enforceServer().logGateExposure(user, gateName);
  },

  /**
   * Get the values of a dynamic config, evaluated against the given user.
   * An exposure event will automatically be logged for the dynamic config.
   *
   * @param {StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {DynamicConfig} - the config for the user
   * @throws Error if initialize() was not called first
   */
  getConfigSync(user: StatsigUser, configName: string): DynamicConfig {
    return this._enforceServer().getConfigSync(user, configName);
  },

  /**
   * Get the values of a dynamic config, evaluated against the given user.
   * No exposure event will be logged.
   *
   * @param {StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {DynamicConfig} - the config for the user
   * @throws Error if initialize() was not called first
   */
  getConfigWithExposureLoggingDisabledSync(
    user: StatsigUser,
    configName: string,
  ): DynamicConfig {
    return this._enforceServer().getConfigWithExposureLoggingDisabledSync(
      user,
      configName,
    );
  },

  /**
   * Logs an exposure event for the dynamic config
   *
   * @param {StatsigUser} user - the user to log the exposure against
   * @param {string} configName - the name of the dynamic config to expose
   */
  manuallyLogConfigExposure(user: StatsigUser, configName: string) {
    return this._enforceServer().logConfigExposure(user, configName);
  },

  /**
   * Get the values of an experiment, evaluated against the given user.
   * An exposure event will automatically be logged for the experiment.
   *
   * @param {StatsigUser} user - the user to evaluate for the experiment
   * @param {string} experimentName - the name of the experiment to get
   * @returns {DynamicConfig} - the experiment for the user, represented by a Dynamic Config object
   * @throws Error if initialize() was not called first
   */
  getExperimentSync(user: StatsigUser, experimentName: string): DynamicConfig {
    return this._enforceServer().getExperimentSync(user, experimentName);
  },

  /**
   * Get the values of an experiment, evaluated against the given user.
   * No exposure event will be logged.
   *
   * @param {StatsigUser} user - the user to evaluate for the experiment
   * @param {string} experimentName - the name of the experiment to get
   * @returns {DynamicConfig} - the experiment for the user, represented by a Dynamic Config object
   * @throws Error if initialize() was not called first
   */
  getExperimentWithExposureLoggingDisabledSync(
    user: StatsigUser,
    experimentName: string,
  ): DynamicConfig {
    return this._enforceServer().getExperimentWithExposureLoggingDisabledSync(
      user,
      experimentName,
    );
  },

  /**
   * Get the name of an layer an experiment is in
   * No exposure event will be logged.
   *
   * @param {string} experimentName - the name of the experiment to get
   * @returns {string} - the layer name the experiment belongs to
   * @throws Error if initialize() was not called first
   */

  getExperimentLayer(experimentName: string): string | null {
    return this._enforceServer().getExperimentLayer(experimentName);
  },

  /**
   * Logs an exposure event for the experiment.
   *
   * @param {StatsigUser} user - the user to log the exposure against
   * @param {string} experimentName - the name of the experiment to expose
   */
  manuallyLogExperimentExposure(user: StatsigUser, experimentName: string) {
    return this._enforceServer().logExperimentExposure(user, experimentName);
  },

  /**
   * Get the values of a layer, evaluated against the given user.
   * Exposure events will be fired when get or getValue is called on the resulting Layer class.
   *
   * @param {StatsigUser} user - the user to evaluate for the layer
   * @param {string} layerName - the name of the layer to get
   * @returns {Layer} - the layer for the user, represented by a Layer
   * @throws Error if initialize() was not called first
   */
  getLayerSync(user: StatsigUser, layerName: string): Layer {
    return this._enforceServer().getLayerSync(user, layerName);
  },

  /**
   * Get the values of a layer, evaluated against the given user.
   * No exposure events will be logged from the resulting Layer class.
   *
   * @param {StatsigUser} user - the user to evaluate for the layer
   * @param {string} layerName - the name of the layer to get
   * @returns {Layer} - the layer for the user, represented by a Layer
   * @throws Error if initialize() was not called first
   * @throws Error if the layerName is not provided or not a non-empty string
   */
  getLayerWithExposureLoggingDisabledSync(
    user: StatsigUser,
    layerName: string,
  ): Layer {
    return this._enforceServer().getLayerWithExposureLoggingDisabledSync(
      user,
      layerName,
    );
  },

  /**
   * Logs an exposure event for the parameter in the given layer
   *
   * @param {StatsigUser} user - the user to log the exposure against
   * @param {string} layerName - the name of the layer
   * @param {string} parameterName - the name of the parameter in the layer
   */
  manuallyLogLayerParameterExposure(
    user: StatsigUser,
    layerName: string,
    parameterName: string,
  ) {
    this._enforceServer().logLayerParameterExposure(
      user,
      layerName,
      parameterName,
    );
  },

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   *
   * @param {StatsigUser} user - the user associated with this event
   * @param {string} eventName - the name of the event (name = Purchase)
   * @param {string | number | null} value - the value associated with the event (value = 10)
   * @param {Record<string, string> | null} metadata - other attributes associated with this event (metadata = {item_name: 'banana', currency: 'USD'})
   * @throws Error if initialize() was not called first
   */
  logEvent(
    user: StatsigUser,
    eventName: string,
    value: string | number | null = null,
    metadata: Record<string, unknown> | null = null,
  ): void {
    this._enforceServer().logEvent(user, eventName, value, metadata);
  },

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   *
   * @param {LogEventObject} eventObject - an object containing the event data
   */
  logEventObject(eventObject: LogEventObject): void {
    this._enforceServer().logEventObject(eventObject);
  },

  /**
   * Informs the statsig SDK that the client is closing or shutting down
   * so the SDK can clean up internal stat
   * @param timeout the timeout in milliseconds to wait for pending promises to resolve
   */
  shutdown(timeout?: number): void {
    this._enforceServer().shutdown(timeout);
    OutputLogger.resetLogger();
  },

  /**
   * Informs the statsig SDK that the server is closing or shutting down
   * so the SDK can clean up internal state
   * Ensures any pending promises are resolved and remaining events are flushed.
   * @param timeout the timeout in milliseconds to wait for pending promises to resolve
   */
  async shutdownAsync(timeout?: number): Promise<void> {
    await this._enforceServer().shutdownAsync(timeout);
    OutputLogger.resetLogger();
  },

  /**
   * Returns the initialize values for the given user
   * Can be used to bootstrap a client SDK with up to date values
   * @param user the user to evaluate configurations for
   * @param clientSDKKey the client SDK key to use for fetching configs
   */
  getClientInitializeResponse(
    user: StatsigUser,
    clientSDKKey?: string,
    options?: ClientInitializeResponseOptions,
  ): ClientInitializeResponse | null {
    return this._enforceServer().getClientInitializeResponse(
      user,
      clientSDKKey,
      options,
    );
  },

  /**
   * Overrides the given gate with the provided value
   * If no userID is provided, it will override for all users
   * If a userID is provided, it will override the gate with the given value for that user only
   */
  overrideGate(gateName: string, value: boolean, userID = ''): void {
    this._enforceServer().overrideGate(gateName, value, userID);
  },

  /**
   * Overrides the given config or experiment with the provided value
   * If no userID is provided, it will override for all users
   * If a userID is provided, it will override the config/experiment with the given value for that user only
   */
  overrideConfig(
    configName: string,
    value: Record<string, unknown>,
    userID = '',
  ): void {
    this._enforceServer().overrideConfig(configName, value, userID);
  },

  /**
   * Overrides the given layer with the provided value
   * If no userID is provided, it will override for all users
   * If a userID is provided, it will override the layer with the given value for that user only
   */
  overrideLayer(
    layerName: string,
    value: Record<string, unknown>,
    userID = '',
  ) {
    this._enforceServer().overrideLayer(layerName, value, userID);
  },

  /**
   * Flushes all the events that are currently in the queue to Statsig.
   */
  flush(timeout?: number): Promise<void> {
    const inst = StatsigInstanceUtils.getInstance();
    if (inst == null) {
      return Promise.resolve();
    }
    return inst.flush(timeout);
  },

  /**
   * Clears all gate overrides
   */
  clearAllGateOverrides(): void {
    this._enforceServer().clearAllGateOverrides();
  },

  /**
   * Clears all config overrides
   */
  clearAllConfigOverrides(): void {
    this._enforceServer().clearAllConfigOverrides();
  },

  /**
   * Clears all layer overrides
   */
  clearAllLayerOverrides(): void {
    this._enforceServer().clearAllLayerOverrides();
  },

  /**
   * Gets all Feature Gate names
   *
   * @returns {string[]}
   */
  getFeatureGateList(): string[] {
    return this._enforceServer().getFeatureGateList();
  },

  /**
   * Gets all Dynamic Config names
   *
   * @returns {string[]}
   */
  getDynamicConfigList(): string[] {
    return this._enforceServer().getDynamicConfigList();
  },

  /**
   * Gets all Experiment names
   *
   * @returns {string[]}
   */
  getExperimentList(): string[] {
    return this._enforceServer().getExperimentList();
  },

  /**
   * Gets all Autotune names
   *
   * @returns {string[]}
   */
  getAutotuneList(): string[] {
    return this._enforceServer().getAutotuneList();
  },

  /**
   * Gets all Layer names
   *
   * @returns {string[]}
   */
  getLayerList(): string[] {
    return this._enforceServer().getLayerList();
  },

  syncConfigSpecs(): Promise<void> {
    return this._enforceServer().syncStoreSpecs();
  },

  syncIdLists(): Promise<void> {
    return this._enforceServer().syncStoreIdLists();
  },

  //#region Deprecated Async Methods

  /**
   * @deprecated Please use checkGateSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  checkGate(user: StatsigUser, gateName: string): Promise<boolean> {
    return this._enforceServer().checkGate(user, gateName);
  },

  /**
   * @deprecated Please use getFeatureGateSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getFeatureGate(user: StatsigUser, gateName: string): Promise<FeatureGate> {
    return this._enforceServer().getFeatureGate(user, gateName);
  },

  /**
   * @deprecated Please use checkGateWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  async checkGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<boolean> {
    return this._enforceServer().checkGateWithExposureLoggingDisabled(
      user,
      gateName,
    );
  },

  /**
   * @deprecated Please use getFeatureGateWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getFeatureGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<FeatureGate> {
    return this._enforceServer().getFeatureGateWithExposureLoggingDisabled(
      user,
      gateName,
    );
  },

  /**
   * @deprecated Please use getConfigSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getConfig(user: StatsigUser, configName: string): Promise<DynamicConfig> {
    return this._enforceServer().getConfig(user, configName);
  },

  /**
   * @deprecated Please use getConfigWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getConfigWithExposureLoggingDisabled(
    user: StatsigUser,
    configName: string,
  ): Promise<DynamicConfig> {
    return this._enforceServer().getConfigWithExposureLoggingDisabled(
      user,
      configName,
    );
  },

  /**
   * @deprecated Please use getExperimentSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return this._enforceServer().getExperiment(user, experimentName);
  },

  /**
   * @deprecated Please use getExperimentWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getExperimentWithExposureLoggingDisabled(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return this._enforceServer().getExperimentWithExposureLoggingDisabled(
      user,
      experimentName,
    );
  },

  /**
   * @deprecated Please use getLayerSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    return this._enforceServer().getLayer(user, layerName);
  },

  /**
   * @deprecated Please use getLayerWithExposureLoggingDisabledSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   */
  getLayerWithExposureLoggingDisabled(
    user: StatsigUser,
    layerName: string,
  ): Promise<Layer> {
    return this._enforceServer().getLayerWithExposureLoggingDisabled(
      user,
      layerName,
    );
  },

  //#endregion

  /**
   * Gets the boolean result of a gate, evaluated against the given user.
   * An exposure event will automatically be logged for the gate.
   * This is a synchronous version of checkGate, and will return false value if a condition
   * needs to fallback to the server.
   *
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {boolean} - The value of the gate for the user.  Gates are off (return false) by default
   * @deprecated Please use checkGateSync instead.
   * @see https://docs.statsig.com/server/deprecation-notices
   * @throws Error if initialize() was not called first
   */
  checkGateWithoutServerFallback(user: StatsigUser, gateName: string): boolean {
    return this._enforceServer().checkGateSync(user, gateName);
  },

  _enforceServer(): StatsigServer {
    const instance = StatsigInstanceUtils.getInstance();
    if (instance == null) {
      throw new StatsigUninitializedError();
    }
    return instance;
  },
};

type Statsig = Omit<typeof Statsig, '_enforceServer'>;
export default Statsig as Statsig;
module.exports = { default: Statsig as Statsig, ...Statsig };

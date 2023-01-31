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

  // These need to be exported, and we currently export a top level Statsig object
  // So in order to not make a breaking change, they must be exported as members of
  // that top level object
  DynamicConfig: DynamicConfig,
  Layer: Layer,

  /**
   * Initializes the statsig server SDK.
   * This must be called before checking gates/configs or logging events.
   *
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {?StatsigOptions} [options={}] - manual sdk configuration for advanced setup
   * @returns {Promise<void>} - a promise which rejects only if you fail to provide a proper SDK Key
   * @throws Error if a Server Secret Key is not provided
   */
  initialize(secretKey: string, options: StatsigOptions = {}): Promise<void> {
    const inst = Statsig._instance ?? new StatsigServer(secretKey, options);

    if (Statsig._instance == null) {
      Statsig._instance = inst;
    }

    return inst.initializeAsync();
  },

  /**
   * Gets the boolean result of a gate, evaluated against the given user.
   * An exposure event will automatically be logged for the gate.
   *
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  checkGate(user: StatsigUser, gateName: string): Promise<boolean> {
    return this._enforceServer().checkGate(user, gateName);
  },

  /**
   * Gets the boolean result of a gate, evaluated against the given user.
   * No exposure event will be logged.
   *
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  checkGateWithExposureLoggingDisabled(
    user: StatsigUser,
    gateName: string,
  ): Promise<boolean> {
    return this._enforceServer().checkGateWithExposureLoggingDisabled(
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
   * @returns {Promise<DynamicConfig>} - the config for the user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a non-empty string
   */
  getConfig(user: StatsigUser, configName: string): Promise<DynamicConfig> {
    return this._enforceServer().getConfig(user, configName);
  },

  /**
   * Get the values of a dynamic config, evaluated against the given user.
   * No exposure event will be logged.
   *
   * @param {StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {Promise<DynamicConfig>} - the config for the user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a non-empty string
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
   * @returns {Promise<DynamicConfig>} - the experiment for the user, represented by a Dynamic Config object
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
   */
  getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig> {
    return this._enforceServer().getExperiment(user, experimentName);
  },

  /**
   * Get the values of an experiment, evaluated against the given user.
   * No exposure event will be logged.
   *
   * @param {StatsigUser} user - the user to evaluate for the experiment
   * @param {string} experimentName - the name of the experiment to get
   * @returns {Promise<DynamicConfig>} - the experiment for the user, represented by a Dynamic Config object
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
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
   * Logs an exposure event for the experiment
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
   * @returns {Promise<Layer>} - the layer for the user, represented by a Layer
   * @throws Error if initialize() was not called first
   * @throws Error if the layerName is not provided or not a non-empty string
   */
  getLayer(user: StatsigUser, layerName: string): Promise<Layer> {
    return this._enforceServer().getLayer(user, layerName);
  },

  /**
   * Get the values of a layer, evaluated against the given user.
   * No exposure events will be logged from the resulting Layer class.
   *
   * @param {StatsigUser} user - the user to evaluate for the layer
   * @param {string} layerName - the name of the layer to get
   * @returns {Promise<Layer>} - the layer for the user, represented by a Layer
   * @throws Error if initialize() was not called first
   * @throws Error if the layerName is not provided or not a non-empty string
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
   * so the SDK can clean up internal state
   */
  shutdown(): void {
    this._enforceServer().shutdown();
  },

  /**
   * Returns the initialize values for the given user
   * Can be used to bootstrap a client SDK with up to date values
   * @param user the user to evaluate configurations for
   */
  getClientInitializeResponse(
    user: StatsigUser,
  ): Record<string, unknown> | null {
    return this._enforceServer().getClientInitializeResponse(user);
  },

  /**
   * Overrides the given gate with the provided value
   * If no userID is provided, it will override for all users
   * If a userID is provided, it will override the gate with the given value for that user only
   */
  overrideGate(gateName: string, value: boolean, userID: string = ''): void {
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
    userID: string = '',
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
  flush(): Promise<void> {
    const inst = Statsig._instance;
    if (inst == null) {
      return Promise.resolve();
    }
    return inst.flush();
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
   * Gets all Feature Gate names
   *
   * @returns {string[]}
   */
  getFeatureGateList(): string[] {
    return this._enforceServer().getFeatureGateList();
  },

  _enforceServer(): StatsigServer {
    if (Statsig._instance == null) {
      throw new StatsigUninitializedError();
    }
    return Statsig._instance;
  },
};

type Statsig = Omit<typeof Statsig, '_instance' | '_enforceServer'>;
export default Statsig as Statsig;
module.exports = Statsig as Statsig;

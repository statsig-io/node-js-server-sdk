declare module 'statsig-node' {
  /**
   * An object of properties relating to the current user
   * Provide as many as possible to take advantage of advanced conditions in the statsig console
   * A dictionary of additional fields can be provided under the "custom" field
   */
  export type StatsigUser = {
    userID: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    country?: string;
    locale?: string;
    appVersion?: string;
    custom?: Record<string, string | number | boolean | Array<string> | undefined>;
    privateAttributes?: Record<string, string | number | boolean | Array<string> | undefined>;
  };

  /**
   * An object of properties for initializing the sdk with advanced options
   */
  export type StatsigOptions = {
    api?: string;
    bootstrapValues?: string;
    environment?: StatsigEnvironment;
    rulesUpdatedCallback?: { (rulesJSON: string, time: number): void };
  };

  export type StatsigEnvironment = {
    tier?: 'production' | 'staging' | 'development';
    [key: string]: string;
  };

  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {?StatsigOptions} [options={}] - manual sdk configuration for advanced setup
   * @returns {Promise<void>} - a promise which rejects only if you fail to provide a proper SDK Key
   * @throws Error if a Server Secret Key is not provided
   */
  export function initialize(
    secretKey: string,
    options?: StatsigOptions,
  ): Promise<void>;

  /**
   * Check the value of a gate configured in the statsig console
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  export function checkGate(
    user: StatsigUser,
    gateName: string,
  ): Promise<boolean>;

  /**
   * Checks the value of a config for a given user
   * @param {StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {Promise<DynamicConfig>} - the config for the user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a non-empty string
   */
  export function getConfig(
    user: StatsigUser,
    configName: string,
  ): Promise<DynamicConfig>;

  /**
   * Gets the experiment for a given user
   * @param {StatsigUser} user - the user to evaluate for the experiment
   * @param {string} experimentName - the name of the experiment to get
   * @returns {Promise<DynamicConfig>} - the experiment for the user, represented by a Dynamic Config object
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
   */
  export function getExperiment(
    user: StatsigUser,
    experimentName: string,
  ): Promise<DynamicConfig>;

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   * @param {StatsigUser} user - the user associated with this event
   * @param {string} eventName - the name of the event (name = Purchase)
   * @param {?string | number} value - the value associated with the event (value = 10)
   * @param {?Record<string, string>} metadata - other attributes associated with this event (metadata = {item_name: 'banana', currency: 'USD'})
   * @throws Error if initialize() was not called first
   */
  export function logEvent(
    user: StatsigUser | null,
    name: string,
    value?: string | number,
    metadata?: Record<string, string>,
  ): void;

  export function logEventObject(eventObject: LogEventObject): void;

  /**
   * Informs the statsig SDK that the client is closing or shutting down
   * so the SDK can clean up internal state
   */
  export function shutdown(): void;

  /**
   * Returns the data for a DynamicConfig in the statsig console via typed get functions
   */
  export class DynamicConfig {
    value: object;
    getValue(
      key: string,
      defaultValue: any | null,
    ): boolean | number | string | object | Array<any> | null;
    get<T extends boolean | number | string | object | Array<any>>(
      key: string,
      defaultValue: T,
    ): T;
  }

  export type LogEventObject = {
    eventName: string;
    user: StatsigUser | null;
    value: string | number | null;
    time: number | null;
    metadata: Record<string, string> | null;
  };
}

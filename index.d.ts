declare module 'statsig-node-js-server-sdk' {
  /**
   * An object of properties relating to the current user
   * Provide as many as possible to take advantage of advanced conditions in the statsig console
   * A dictionary of additional fields can be provided under the "custom" field
   */
  export type StatsigUser = {
    userID?: string | number;
    email?: string;
    ip?: string;
    userAgent?: string;
    country?: string;
    locale?: string;
    clientVersion?: string;
    custom?: Record<string, string>;
  };

  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {StatsigOptions} options - manual sdk configuration for advanced setup
   * @returns {Promise<void>} - a promise which rejects only if you fail to provide a proper SDK Key
   * @throws Error if a Server Secret Key is not provided
   */
  export function initialize(secretKey: string, options: object): Promise<void>;

  /**
   * Check the value of a gate configured in the statsig console
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a string
   */
  export function checkGate(
    user: StatsigUser,
    gateName: string
  ): Promise<boolean>;

  /**
   * Checks the value of a config for a given user
   * @param {StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {Promise<DynamicConfig>} - the config for the user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a string
   */
  export function getConfig(
    user: StatsigUser,
    configName: string
  ): Promise<DynamicConfig>;

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   * @param {StatsigUser} user - the user associated with this event
   * @param {string} eventName - the name of the event (name = Purchase)
   * @param {string | number} value - the value associated with the event (value = 10)
   * @param {object} metadata - other attributes associated with this event (metadata = {items: 2, currency: USD})
   */
  export function logEvent(
    user: StatsigUser | null,
    name: string,
    value?: string | number,
    metadata?: object
  ): void;

  /**
   * Checks to see if the SDK is in a ready state to check gates and configs
   * If the SDK is initializing or switching users, it is not in a ready state.
   * @returns {boolean} if the SDK is ready
   */
  export function isReady(): boolean;

  /**
   * Informs the statsig SDK that the client is closing or shutting down
   * so the SDK can clean up internal state
   */
  export function shutdown(): void;

  /**
   * Returns the data for a DynamicConfig in the statsig console via typed get functions
   */
  export interface DynamicConfig {
    value: any;
    getBool(name: string, defaultValue: boolean): boolean;
    getNumber(name: string, defaultValue: number): number;
    getString(name: string, defaultValue: string): string;
    getArray(name: string, defaultValue: Array<any>): Array<any>;
    getObject(name: string, defaultValue: object): object;
    getRawValue(): any;
  }
}

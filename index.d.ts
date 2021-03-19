declare module 'statsig-node-js-server-sdk' {
  /**
   * An object of properties relating to a user
   * */
  export interface StatsigUser {
    userID?: string | number;
    ip?: string;
    userAgent?: string;
    name?: string;
    country?: string;
    email?: string;
    custom?: {
      [key: string]:
        | string
        | boolean
        | number
        | object
        | Array<string | boolean | number>;
    };
  }

  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {StatsigOptions} options - manual sdk configuration for advanced setup
   * @returns {Promise<void>}
   */
  export function initialize(secretKey: string, options: object): Promise<void>;

  /**
   * Check the value of a gate configured in the statsig console
   * @param {StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
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
    getObject(name: string, defaultValue: object): object;
    getRawValue(): any;
  }
}

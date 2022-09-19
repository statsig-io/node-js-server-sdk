export type AdapterResponse = {
  value?: string,
  time?: number,
  error?: Error,
}

/**
 * An adapter for implementing custom storage of config specs.
 * Useful for backing up data in memory. 
 * Can also be used to bootstrap Statsig server.
 */
export interface IDataAdapter {
  /**
   * Returns the data stored for a specific key
   * @param key - Key of stored item to fetch
   */
  get(key: string): Promise<AdapterResponse>;

  /**
   * Updates data stored for single key
   * @param key - Key of stored item to update
   * @param value - New value to store
   * @param time - Time of update
   */
  set(key: string, value: string, time?: number): Promise<void>;
 
  /**
   * Updates data stored for each key
   * @param records - List of key/value pairs to update
   * @param key - Optional master key to store all records under
   * @param time - Time of update
   */
  setMulti(
    records: Record<string, string>,
    key?: string,
    time?: number,
  ): Promise<void>;

  /**
   * Startup tasks to run before any fetch/update calls can be made
   */
  initialize(): Promise<void>;

  /**
   * Cleanup tasks to run when statsig is shutdown
   */
  shutdown(): Promise<void>;
}
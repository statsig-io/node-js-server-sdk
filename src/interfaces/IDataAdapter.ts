export type AdapterResponse = {
  result?: Record<string, string>,
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
   * Returns the data stored for each key
   * @param keys - Keys of stored data to fetch
   */
  get(keys: string[]): Promise<AdapterResponse>;

  /**
   * Updates data stored for each key/value pair
   * @param records - List of key/value pairs to update
   * @param time - Time of update
   */
  set(records: Record<string, string>, time?: number): Promise<void>;

  /**
   * Startup tasks to run before any fetch/update calls can be made
   */
  initialize(): Promise<void>;

  /**
   * Cleanup tasks to run when statsig is shutdown
   */
  shutdown(): Promise<void>;
}
import { ConfigSpec } from "../ConfigSpec";
import { ConfigStore, IDList } from "../SpecStore";

export type AdapterResponse = {
  store?: ConfigStore,
  item?: ConfigItem,
  time?: number,
  error?: Error,
}

export type ConfigItem = Record<string, unknown>

export type InputConfigStore = {
  gates?: Record<string, ConfigSpec>,
  configs?: Record<string, ConfigSpec>,
  idLists?: Record<string, IDList>,
  layers?: Record<string, ConfigSpec>,
  experimentToLayer?: Record<string, string>,
}

/**
 * An adapter for implementing custom storage of config specs.
 * Useful for backing up data in memory. 
 * Can also be used to bootstrap Statsig server.
 */
export interface IDataAdapter {
  /**
   * Returns all stored data
   */
  fetchStore(): Promise<AdapterResponse>;

  /**
   * Optional -- Implement for more efficient single item data fetching
   * @param item - Key of item in storage
   */
  fetchFromStore?(item: string): Promise<AdapterResponse>;

  /**
   * Updates store with new data provided. 
   * @param store - updated data to store
   * @param time - updated time to timestamp freshness of data
   */
  updateStore(store: InputConfigStore, time?: number): Promise<void>;

  /**
   * Optional -- Cleanup tasks to run when statsig is shutdown
   */
  shutdown?(): Promise<void>;
}
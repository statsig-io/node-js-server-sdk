export type AdapterResponse = {
  result?: Record<string, unknown>,
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
   * Dynamic configs
   */
  getConfigs(): Promise<AdapterResponse>;
  setConfigs(configs: Record<string, unknown>, time?: number): Promise<void>;

  /**
   * Feature gates
   */
  getGates(): Promise<AdapterResponse>;
  setGates(gates: Record<string, unknown>, time?: number): Promise<void>;

  /**
   * Id lists
   */
  getIDLists(): Promise<AdapterResponse>;
  setIDLists(idLists: Record<string, unknown>, time?: number): Promise<void>;

  /**
   * Layer to experiment mapping
   */
  getLayers(): Promise<AdapterResponse>;
  setLayers(layers: Record<string, unknown>, time?: number): Promise<void>;

  /**
   * Layer configs
   */
  getLayerConfigs(): Promise<AdapterResponse>;
  setLayerConfigs(layerConfigs: Record<string, unknown>, time?: number): Promise<void>;

  /**
   * Startup tasks to run before any fetch/update calls can be made
   */
  initialize(): Promise<void>;

  /**
   * Optional -- Cleanup tasks to run when statsig is shutdown
   */
  shutdown?(): Promise<void>;
}
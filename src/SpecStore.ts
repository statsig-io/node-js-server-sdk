import { ConfigSpec } from './ConfigSpec';
import Diagnostics, { ContextType, MAX_SAMPLING_RATE } from './Diagnostics';
import {
  StatsigInitializeFromNetworkError,
  StatsigInitializeIDListsError,
  StatsigInvalidBootstrapValuesError,
  StatsigInvalidConfigSpecsResponseError,
  StatsigInvalidDataAdapterValuesError,
  StatsigInvalidIDListsResponseError,
  StatsigLocalModeNetworkError,
} from './Errors';
import { EvaluationReason } from './EvaluationReason';
import { InitializationSource } from './InitializationDetails';
import {
  DataAdapterKeyPath,
  getDataAdapterKey,
  IDataAdapter,
} from './interfaces/IDataAdapter';
import OutputLogger from './OutputLogger';
import SDKFlags from './SDKFlags';
import {
  ExplicitStatsigOptions,
  InitStrategy,
  NetworkOverrideFunc,
} from './StatsigOptions';
import { poll } from './utils/core';
import { sha256HashBase64 } from './utils/Hashing';
import IDListUtil, { IDList } from './utils/IDListUtil';
import safeFetch from './utils/safeFetch';
import { InitializeContext } from './utils/StatsigContext';
import StatsigFetcher from './utils/StatsigFetcher';

const SYNC_OUTDATED_MAX = 120 * 1000;

export type ConfigStore = {
  gates: Record<string, ConfigSpec>;
  configs: Record<string, ConfigSpec>;
  idLists: Record<string, IDList>;
  layers: Record<string, ConfigSpec>;
  experimentToLayer: Record<string, string>;
};

export type APIEntityNames = {
  gates: string[];
  configs: string[];
};

export default class SpecStore {
  private initReason: EvaluationReason;
  private rulesUpdatedCallback: ((rules: string, time: number) => void) | null;
  private initialUpdateTime: number;
  private lastUpdateTime: number;
  private store: ConfigStore;
  private rulesetsSyncInterval: number;
  private idListsSyncInterval: number;
  private disableRulesetsSync: boolean;
  private disableIdListsSync: boolean;
  private initialized: boolean;
  private hashedSDKKey: string;
  private rulesetsSyncTimer: NodeJS.Timeout | null;
  private idListsSyncTimer: NodeJS.Timeout | null;
  private rulesetsSyncTimerLastActiveTime: number = Date.now();
  private idListsSyncTimerLastActiveTime: number = Date.now();
  private rulesetsSyncPromise: () => Promise<void> = () => Promise.resolve();
  private idListsSyncPromise: () => Promise<void> = () => Promise.resolve();
  private fetcher: StatsigFetcher;
  private dataAdapter: IDataAdapter | null;
  private rulesetsSyncFailureCount = 0;
  private idListsSyncFailureCount = 0;
  private getIDListCallCount = 0;
  private bootstrapValues: string | null;
  private initStrategyForIDLists: InitStrategy;
  private clientSDKKeyToAppMap: Record<string, string> = {};
  private hashedClientSDKKeyToAppMap: Record<string, string> = {};
  private hashedSDKKeysToEntities: Record<string, APIEntityNames> = {};
  private primaryTargetAppID: string | null;
  private networkOverrideFunc: NetworkOverrideFunc | null;
  private defaultEnvironemnt: string | null;

  public constructor(
    secretKey: string,
    fetcher: StatsigFetcher,
    options: ExplicitStatsigOptions,
  ) {
    this.fetcher = fetcher;
    this.rulesUpdatedCallback = options.rulesUpdatedCallback ?? null;
    this.lastUpdateTime = 0;
    this.initialUpdateTime = 0;
    this.store = {
      gates: {},
      configs: {},
      idLists: {},
      layers: {},
      experimentToLayer: {},
    };
    this.networkOverrideFunc = options.networkOverrideFunc ?? null;
    this.hashedSDKKey =
      secretKey != null ? sha256HashBase64(secretKey) : 'undefined';
    this.rulesetsSyncInterval = options.rulesetsSyncIntervalMs;
    this.idListsSyncInterval = options.idListsSyncIntervalMs;
    this.disableRulesetsSync = options.disableRulesetsSync;
    this.disableIdListsSync = options.disableIdListsSync;
    this.initialized = false;
    this.rulesetsSyncTimer = null;
    this.idListsSyncTimer = null;
    this.dataAdapter = options.dataAdapter;
    this.initReason = 'Uninitialized';
    this.bootstrapValues = options.bootstrapValues;
    this.initStrategyForIDLists = options.initStrategyForIDLists;
    this.clientSDKKeyToAppMap = {};
    this.hashedClientSDKKeyToAppMap = {};
    this.primaryTargetAppID = null;
    this.defaultEnvironemnt = null;
  }

  public getInitReason() {
    return this.initReason;
  }

  public getInitialUpdateTime() {
    return this.initialUpdateTime;
  }

  public getLastUpdateTime() {
    return this.lastUpdateTime;
  }

  public getGate(gateName: string): ConfigSpec | null {
    return this.store.gates[gateName] ?? null;
  }

  public getConfig(configName: string): ConfigSpec | null {
    return this.store.configs[configName] ?? null;
  }

  public getLayer(layerName: string): ConfigSpec | null {
    return this.store.layers[layerName] ?? null;
  }

  public getExperimentLayer(experimentName: string): string | null {
    return this.store.experimentToLayer[experimentName] ?? null;
  }

  public getIDList(listName: string): IDList | null {
    return this.store.idLists[listName] ?? null;
  }

  public getAllGates(): Record<string, ConfigSpec> {
    return this.store.gates;
  }

  public getAllConfigs(): Record<string, ConfigSpec> {
    return this.store.configs;
  }

  public getAllLayers(): Record<string, ConfigSpec> {
    return this.store.layers;
  }

  public getClientKeyToAppMap(): Record<string, string> {
    return this.clientSDKKeyToAppMap;
  }

  public getHashedClientKeyToAppMap(): Record<string, string> {
    return this.hashedClientSDKKeyToAppMap;
  }

  public getHashedSDKKeysToEntities(): Record<string, APIEntityNames> {
    return this.hashedSDKKeysToEntities;
  }

  public getPrimaryTargetAppID(): string | null {
    return this.primaryTargetAppID;
  }

  public getDefaultEnvironment(): string | null {
    return this.defaultEnvironemnt;
  }

  public async init(ctx: InitializeContext): Promise<void> {
    let specsJSON = null;

    if (this.dataAdapter) {
      if (this.bootstrapValues != null) {
        OutputLogger.info(
          'statsigSDK::initialize> Conflict between bootstrap and adapter. Defaulting to adapter.',
        );
      }
      await this.dataAdapter.initialize();
      const { synced, error } = await this._fetchConfigSpecsFromAdapter();
      if (synced) {
        ctx.setSuccess('DataAdapter');
      }
      if (error) {
        ctx.setFailed(error);
      }
    }

    if (this.initReason === 'Uninitialized' && this.bootstrapValues != null) {
      try {
        Diagnostics.mark.bootstrap.process.start({});
        specsJSON = JSON.parse(this.bootstrapValues);
        this._process(specsJSON);
        if (this.lastUpdateTime !== 0) {
          this.initReason = 'Bootstrap';
          ctx.setSuccess('Bootstrap');
        }
      } catch {
        const error = new StatsigInvalidBootstrapValuesError();
        OutputLogger.error(error);
        ctx.setFailed(error);
      }

      Diagnostics.mark.bootstrap.process.end({
        success: this.initReason === 'Bootstrap',
      });
    }

    if (this.initReason === 'Uninitialized') {
      const { synced, error } = await this._fetchConfigSpecsFromServer();
      if (synced) {
        ctx.setSuccess('Network');
      }
      if (error) {
        const err = new StatsigInitializeFromNetworkError(error);
        OutputLogger.error(err);
        ctx.setFailed(err);
      }
    }

    this.setInitialUpdateTime();

    if (this.initStrategyForIDLists === 'lazy') {
      setTimeout(async () => {
        await this._initIDLists();
      }, 0);
    } else if (this.initStrategyForIDLists !== 'none') {
      await this._initIDLists();
    }

    this.pollForUpdates();
    this.initialized = true;
  }

  private async _initIDLists(): Promise<void> {
    const { error } = this.dataAdapter
      ? await this.syncIdListsFromDataAdapter()
      : await this.syncIdListsFromNetwork();
    if (error) {
      if (this.dataAdapter) {
        const { error } = await this.syncIdListsFromNetwork();
        if (error) {
          OutputLogger.error(new StatsigInitializeIDListsError(error));
        }
      } else {
        OutputLogger.error(new StatsigInitializeIDListsError(error));
      }
    }
  }

  public resetSyncTimerIfExited(): Error | null {
    const rulesetsSyncTimerInactive =
      this.rulesetsSyncTimerLastActiveTime <
      Date.now() - Math.max(SYNC_OUTDATED_MAX, this.rulesetsSyncInterval);
    const idListsSyncTimerInactive =
      this.idListsSyncTimerLastActiveTime <
      Date.now() - Math.max(SYNC_OUTDATED_MAX, this.idListsSyncInterval);
    if (
      (!rulesetsSyncTimerInactive || this.disableRulesetsSync) &&
      (!idListsSyncTimerInactive || this.disableIdListsSync)
    ) {
      return null;
    }
    let message = '';
    if (rulesetsSyncTimerInactive && !this.disableRulesetsSync) {
      this.clearRulesetsSyncTimer();
      message = message.concat(
        `Force reset sync timer. Last update time: ${
          this.rulesetsSyncTimerLastActiveTime
        }, now: ${Date.now()}`,
      );
    }
    if (idListsSyncTimerInactive && !this.disableIdListsSync) {
      this.clearIdListsSyncTimer();
      message = message.concat(
        `Force reset id list sync timer. Last update time: ${
          this.idListsSyncTimerLastActiveTime
        }, now: ${Date.now()}`,
      );
    }
    this.pollForUpdates();
    return new Error(message);
  }

  public isServingChecks() {
    return this.lastUpdateTime !== 0;
  }

  private async _fetchConfigSpecsFromServer(): Promise<{
    synced: boolean;
    error?: Error;
  }> {
    try {
      let response: Response | undefined = undefined;
      response = await this.fetcher.downloadConfigSpecs(this.lastUpdateTime);

      Diagnostics.mark.downloadConfigSpecs.process.start({});
      const specsString = await response.text();
      const { success, hasUpdates } = this._process(JSON.parse(specsString));
      if (!success) {
        return {
          synced: false,
          error: new StatsigInvalidConfigSpecsResponseError(),
        };
      }
      this.initReason = 'Network';
      if (
        this.rulesUpdatedCallback != null &&
        typeof this.rulesUpdatedCallback === 'function'
      ) {
        this.rulesUpdatedCallback(specsString, this.lastUpdateTime);
      }
      if (hasUpdates) {
        await this._saveConfigSpecsToAdapter(specsString);
        Diagnostics.mark.downloadConfigSpecs.process.end({
          success: this.initReason === 'Network',
        });
      }
      return { synced: true };
    } catch (e) {
      if (e instanceof StatsigLocalModeNetworkError) {
        return { synced: false };
      } else {
        return { synced: false, error: e as Error };
      }
    }
  }

  private async _fetchConfigSpecsFromAdapter(): Promise<{
    synced: boolean;
    error?: Error;
  }> {
    try {
      if (!this.dataAdapter) {
        return { synced: false };
      }
      const { result, error } = await this.dataAdapter.get(
        getDataAdapterKey(
          this.hashedSDKKey,
          DataAdapterKeyPath.V1Rulesets,
          false,
        ),
      );
      if (result && !error) {
        const configSpecs =
          typeof result === 'string' ? JSON.parse(result) : result;
        const { success } = this._process(configSpecs);
        if (success) {
          this.initReason = 'DataAdapter';
          return { synced: true };
        }
      }
      return {
        synced: false,
        error: new StatsigInvalidDataAdapterValuesError(
          DataAdapterKeyPath.V1Rulesets,
        ),
      };
    } catch (e) {
      return { synced: false, error: e as Error };
    }
  }

  private async _saveConfigSpecsToAdapter(specString: string): Promise<void> {
    if (!this.dataAdapter) {
      return;
    }
    await this.dataAdapter.set(
      getDataAdapterKey(this.hashedSDKKey, DataAdapterKeyPath.V1Rulesets),
      specString,
      this.lastUpdateTime,
    );
  }

  private pollForUpdates() {
    if (this.rulesetsSyncTimer == null && !this.disableRulesetsSync) {
      this.rulesetsSyncTimerLastActiveTime = Date.now();
      this.rulesetsSyncPromise = async () => {
        this.rulesetsSyncTimerLastActiveTime = Date.now();
        await this.syncConfigSpecs();
      };
      this.rulesetsSyncTimer = poll(
        this.rulesetsSyncPromise,
        this.rulesetsSyncInterval,
      );
    }

    if (this.idListsSyncTimer == null && !this.disableIdListsSync) {
      this.idListsSyncTimerLastActiveTime = Date.now();
      this.idListsSyncPromise = async () => {
        this.idListsSyncTimerLastActiveTime = Date.now();
        await this.syncIdLists();
      };
      this.idListsSyncTimer = poll(
        this.idListsSyncPromise,
        this.idListsSyncInterval,
      );
    }
  }

  private logDiagnostics(
    context: ContextType,
    type: 'id_list' | 'config_spec',
  ) {
    if (!this.initialized) {
      return;
    }
    switch (context) {
      case 'config_sync':
        Diagnostics.logDiagnostics('config_sync', {
          type,
        });
        break;
      case 'initialize':
        Diagnostics.logDiagnostics('initialize', {
          type: 'initialize',
        });
        break;
    }
  }

  public async syncConfigSpecs(): Promise<void> {
    const adapter = this.dataAdapter;
    const shouldSyncFromAdapter =
      adapter?.supportsPollingUpdatesFor?.(DataAdapterKeyPath.V1Rulesets) ===
      true;

    const { synced, error } = shouldSyncFromAdapter
      ? await this._fetchConfigSpecsFromAdapter()
      : await this._fetchConfigSpecsFromServer();
    if (synced) {
      this.rulesetsSyncFailureCount = 0;
    } else if (error) {
      OutputLogger.debug(error);
      this.rulesetsSyncFailureCount++;
      if (
        this.rulesetsSyncFailureCount * this.rulesetsSyncInterval >
        SYNC_OUTDATED_MAX
      ) {
        OutputLogger.warn(
          `statsigSDK::sync> Syncing the server SDK from the 
          ${shouldSyncFromAdapter ? 'data adapter' : 'network'}
           has failed for  
           ${this.rulesetsSyncFailureCount * this.rulesetsSyncInterval}
          ms. Your sdk will continue to serve gate/config/experiment definitions as of the last successful sync. See https://docs.statsig.com/messages/serverSDKConnection for more information`,
        );
        this.rulesetsSyncFailureCount = 0;
      }
    }
    this.logDiagnostics('config_sync', 'config_spec');
  }

  public async syncIdLists(): Promise<void> {
    if (this.initStrategyForIDLists === 'none') {
      return;
    }

    const adapter = this.dataAdapter;
    const shouldSyncFromAdapter =
      adapter?.supportsPollingUpdatesFor?.(DataAdapterKeyPath.IDLists) === true;

    let result = shouldSyncFromAdapter
      ? await this.syncIdListsFromDataAdapter()
      : await this.syncIdListsFromNetwork();
    if (shouldSyncFromAdapter && result.error) {
      OutputLogger.debug(result.error);
      OutputLogger.debug(
        'Failed to sync ID lists with data adapter. Retrying with network',
      );
      result = await this.syncIdListsFromNetwork();
    }
    if (result.synced) {
      this.idListsSyncFailureCount = 0;
    } else if (result.error) {
      OutputLogger.debug(result.error);
      this.idListsSyncFailureCount++;
      if (
        this.idListsSyncFailureCount * this.idListsSyncInterval >
        SYNC_OUTDATED_MAX
      ) {
        OutputLogger.warn(
          `statsigSDK::sync> Syncing ID lists from the 
          ${shouldSyncFromAdapter ? 'data adapter' : 'network'} 
          has failed for  ${
            this.idListsSyncFailureCount * this.idListsSyncInterval
          }
          ms. The SDK will continue to serve gate/config/experiment definitions that depend on ID lists as of the last successful sync. See https://docs.statsig.com/messages/serverSDKConnection for more information`,
        );
        this.idListsSyncFailureCount = 0;
      }
    }
    this.logDiagnostics('config_sync', 'id_list');
  }

  // returns a boolean indicating whether specsJSON has was successfully parsed
  private _process(specsJSON: Record<string, unknown>): {
    success: boolean;
    hasUpdates: boolean;
  } {
    const hashedSDKKeyUsed = specsJSON.hashed_sdk_key_used;
    if (hashedSDKKeyUsed != null && typeof hashedSDKKeyUsed === 'string') {
      if (!this.fetcher.validateSDKKeyUsed(hashedSDKKeyUsed)) {
        return { success: false, hasUpdates: true };
      }
    }

    if (!specsJSON?.has_updates) {
      return { success: true, hasUpdates: false };
    }

    if (
      specsJSON?.time !== undefined &&
      (specsJSON.time as number) < this.lastUpdateTime
    ) {
      return { success: true, hasUpdates: true };
    }

    const updatedGates: Record<string, ConfigSpec> = {};
    const updatedConfigs: Record<string, ConfigSpec> = {};
    const updatedLayers: Record<string, ConfigSpec> = {};
    const gateArray = specsJSON?.feature_gates;
    const configArray = specsJSON?.dynamic_configs;
    const layersArray = specsJSON?.layer_configs;
    const layerToExperimentMap = specsJSON?.layers;
    const samplingRates = specsJSON?.diagnostics;

    Diagnostics.instance.setSamplingRate(samplingRates);

    if (
      !Array.isArray(gateArray) ||
      !Array.isArray(configArray) ||
      !Array.isArray(layersArray)
    ) {
      return { success: false, hasUpdates: true };
    }

    for (const gateJSON of gateArray) {
      try {
        const gate = new ConfigSpec(gateJSON);
        updatedGates[gate.name] = gate;
      } catch (e) {
        return { success: false, hasUpdates: true };
      }
    }

    for (const configJSON of configArray) {
      try {
        const config = new ConfigSpec(configJSON);
        updatedConfigs[config.name] = config;
      } catch (e) {
        return { success: false, hasUpdates: true };
      }
    }

    for (const layerJSON of layersArray) {
      try {
        const config = new ConfigSpec(layerJSON);
        updatedLayers[config.name] = config;
      } catch (e) {
        return { success: false, hasUpdates: true };
      }
    }

    SDKFlags.setFlags(specsJSON?.sdk_flags);

    const updatedExpToLayer: Record<string, string> =
      this._reverseLayerExperimentMapping(layerToExperimentMap);

    this.store.gates = updatedGates;
    this.store.configs = updatedConfigs;
    this.store.layers = updatedLayers;
    this.store.experimentToLayer = updatedExpToLayer;
    this.lastUpdateTime = (specsJSON.time as number) ?? this.lastUpdateTime;
    this.clientSDKKeyToAppMap = (specsJSON?.sdk_keys_to_app_ids ??
      {}) as Record<string, string>;
    this.hashedClientSDKKeyToAppMap = (specsJSON?.hashed_sdk_keys_to_app_ids ??
      {}) as Record<string, string>;
    this.hashedSDKKeysToEntities = (specsJSON?.hashed_sdk_keys_to_entities ??
      {}) as Record<string, APIEntityNames>;
    this.primaryTargetAppID = (specsJSON?.app_id ?? null) as string | null;
    this.defaultEnvironemnt = (specsJSON?.default_environment ?? null) as
      | string
      | null;
    return { success: true, hasUpdates: true };
  }

  /**
   * Returns a reverse mapping of layers to experiment (or vice versa)
   */
  private _reverseLayerExperimentMapping(
    layersMapping: unknown,
  ): Record<string, string> {
    const reverseMapping: Record<string, string> = {};
    if (layersMapping != null && typeof layersMapping === 'object') {
      for (const [layerName, experiments] of Object.entries(layersMapping)) {
        for (const experimentName of experiments) {
          // experiment -> layer is a 1:1 mapping
          reverseMapping[experimentName] = layerName;
        }
      }
    }
    return reverseMapping;
  }

  private async syncIdListsFromDataAdapter(): Promise<{
    synced: boolean;
    error?: Error;
  }> {
    try {
      const dataAdapter = this.dataAdapter;
      if (!dataAdapter) {
        return { synced: false };
      }
      const { result: adapterIdLists } = await dataAdapter.get(
        getDataAdapterKey(this.hashedSDKKey, DataAdapterKeyPath.IDLists),
      );
      if (!adapterIdLists) {
        return {
          synced: false,
          error: new StatsigInvalidDataAdapterValuesError(
            DataAdapterKeyPath.IDLists,
          ),
        };
      }
      const lookup = IDListUtil.parseBootstrapLookup(adapterIdLists);
      if (!lookup) {
        return {
          synced: false,
          error: new StatsigInvalidDataAdapterValuesError(
            DataAdapterKeyPath.IDLists,
          ),
        };
      }

      const tasks: Promise<void>[] = [];
      for (const name of lookup) {
        tasks.push(
          new Promise((resolve, reject) => {
            dataAdapter
              .get(
                getDataAdapterKey(
                  this.hashedSDKKey,
                  DataAdapterKeyPath.IDList,
                  false,
                  name,
                ),
              )
              .then(({ result: data }) => {
                if (!data || typeof data !== 'string') {
                  return reject(
                    new StatsigInvalidDataAdapterValuesError(
                      DataAdapterKeyPath.V1Rulesets,
                    ),
                  );
                }
                this.store.idLists[name] = {
                  ids: {},
                  readBytes: 0,
                  url: 'bootstrap',
                  fileID: 'bootstrap',
                  creationTime: 0,
                };

                IDListUtil.updateIdList(this.store.idLists, name, data);
              })
              .catch((e) => {
                OutputLogger.debug(e);
              })
              .finally(() => resolve());
          }),
        );
      }

      await Promise.all(tasks);
      return { synced: true };
    } catch (e) {
      return { synced: false, error: e as Error };
    }
  }

  private async syncIdListsFromNetwork(): Promise<{
    synced: boolean;
    error?: Error;
  }> {
    let response: Response | null = null;
    try {
      response = await this.fetcher.getIDLists();
    } catch (e) {
      if (e instanceof StatsigLocalModeNetworkError) {
        return { synced: false };
      } else {
        return { synced: false, error: e as Error };
      }
    }

    if (!response) {
      return { synced: false };
    }

    let error: Error | undefined;
    try {
      const json = await response.json();
      const lookup = IDListUtil.parseLookupResponse(json);
      if (!lookup) {
        return {
          synced: false,
          error: new StatsigInvalidIDListsResponseError(),
        };
      }
      Diagnostics.mark.getIDListSources.process.start({
        idListCount: Object.keys(lookup).length,
      });
      const promises = [];

      for (const [name, item] of Object.entries(lookup)) {
        const url = item.url;
        const fileID = item.fileID;
        const newCreationTime = item.creationTime;
        const oldCreationTime = this.store.idLists[name]?.creationTime ?? 0;
        if (
          typeof url !== 'string' ||
          newCreationTime < oldCreationTime ||
          typeof fileID !== 'string'
        ) {
          continue;
        }
        const newFile =
          fileID !== this.store.idLists[name]?.fileID &&
          newCreationTime >= oldCreationTime;

        if (
          (Object.prototype.hasOwnProperty.call(lookup, name) &&
            !Object.prototype.hasOwnProperty.call(this.store.idLists, name)) ||
          newFile // when fileID changes, we reset the whole list
        ) {
          this.store.idLists[name] = {
            ids: {},
            readBytes: 0,
            url,
            fileID,
            creationTime: newCreationTime,
          };
        }
        const fileSize = item.size ?? 0;
        const readSize = this.store.idLists[name].readBytes ?? 0;
        if (fileSize <= readSize) {
          continue;
        }
        promises.push(this.genFetchIDList(name, url, readSize));
      }

      IDListUtil.removeOldIdLists(this.store.idLists, lookup);

      await Promise.all(promises.map((p) => p.catch()));

      if (this.dataAdapter) {
        await IDListUtil.saveToDataAdapter(
          this.hashedSDKKey,
          this.dataAdapter,
          this.store.idLists,
        );
      }
    } catch (e) {
      error = e as Error;
    } finally {
      Diagnostics.mark.getIDListSources.process.end({
        success: !error,
      });
    }
    return { synced: !error, error };
  }

  private async genFetchIDList(
    name: string,
    url: string,
    readSize: number,
  ): Promise<void> {
    let threwNetworkError = false;
    let res: Response | null = null;
    ++this.getIDListCallCount;
    const markerID = String(this.getIDListCallCount);
    // Log 1 idlist every 50 getIDList call
    const shouldLog = this.getIDListCallCount % 50 === 1;
    const diagnostics = shouldLog ? Diagnostics.mark.getIDList : null;
    try {
      diagnostics?.networkRequest.start({
        url: url,
        markerID,
      });

      const fetcher = this.networkOverrideFunc ?? safeFetch;
      res = await fetcher(url, {
        method: 'GET',
        headers: {
          Range: `bytes=${readSize}-`,
        },
      });
    } catch (e) {
      threwNetworkError = true;
    } finally {
      diagnostics?.networkRequest.end({
        statusCode: res?.status,
        success: res?.ok ?? false,
        markerID,
      });
    }

    if (threwNetworkError || !res) {
      return;
    }

    try {
      diagnostics?.process.start({ markerID });
      const contentLength = res.headers.get('content-length');
      if (contentLength == null) {
        throw new Error('Content-Length for the id list is invalid.');
      }
      const length = parseInt(contentLength);
      if (typeof length === 'number') {
        this.store.idLists[name].readBytes += length;
      } else {
        delete this.store.idLists[name];
        throw new Error('Content-Length for the id list is invalid.');
      }
      IDListUtil.updateIdList(this.store.idLists, name, await res.text());
      diagnostics?.process.end({
        success: true,
        markerID,
      });
    } catch (e) {
      OutputLogger.debug(e as Error);
      diagnostics?.process.end({
        success: false,
        markerID,
      });
    }
  }

  public shutdown(): void {
    this.clearTimers();
    this.dataAdapter?.shutdown();
  }

  public async shutdownAsync(): Promise<void> {
    this.shutdown();
    await this.rulesetsSyncPromise();
    await this.idListsSyncPromise();
  }

  private clearRulesetsSyncTimer(): void {
    if (this.rulesetsSyncTimer != null) {
      clearInterval(this.rulesetsSyncTimer);
      this.rulesetsSyncTimer = null;
    }
  }

  private clearIdListsSyncTimer(): void {
    if (this.idListsSyncTimer != null) {
      clearInterval(this.idListsSyncTimer);
      this.idListsSyncTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearRulesetsSyncTimer();
    this.clearIdListsSyncTimer();
  }

  private setInitialUpdateTime() {
    this.initialUpdateTime =
      this.lastUpdateTime === 0 ? -1 : this.lastUpdateTime;
  }
}

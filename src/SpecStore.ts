import { ConfigSpec } from './ConfigSpec';
import Diagnostics, { ContextType, MAX_SAMPLING_RATE } from './Diagnostics';
import {
  StatsigInitializeFromNetworkError,
  StatsigInvalidBootstrapValuesError,
  StatsigLocalModeNetworkError,
} from './Errors';
import { EvaluationReason } from './EvaluationReason';
import { DataAdapterKey, IDataAdapter } from './interfaces/IDataAdapter';
import OutputLogger from './OutputLogger';
import { ExplicitStatsigOptions, InitStrategy } from './StatsigOptions';
import { poll } from './utils/core';
import IDListUtil, { IDList } from './utils/IDListUtil';
import safeFetch from './utils/safeFetch';
import StatsigFetcher from './utils/StatsigFetcher';
const { getStatsigMetadata } = require('./utils/core');

const SYNC_OUTDATED_MAX = 120 * 1000;

export type ConfigStore = {
  gates: Record<string, ConfigSpec>;
  configs: Record<string, ConfigSpec>;
  idLists: Record<string, IDList>;
  layers: Record<string, ConfigSpec>;
  experimentToLayer: Record<string, string>;
};

export type DiagnosticsSamplingRate = {
  dcs: number;
  log: number;
  idlist: number;
  initialize: number;
};

export type SDKConstants = DiagnosticsSamplingRate;

export default class SpecStore {
  private initReason: EvaluationReason;
  private api: string;
  private apiForDownloadConfigSpecs: string | null;
  private rulesUpdatedCallback: ((rules: string, time: number) => void) | null;
  private initialUpdateTime: number;
  private lastUpdateTime: number;
  private store: ConfigStore;
  private syncInterval: number;
  private idListSyncInterval: number;
  private initialized: boolean;
  private syncTimer: NodeJS.Timeout | null;
  private idListsSyncTimer: NodeJS.Timeout | null;
  private syncTimerLastActiveTime: number = Date.now();
  private idListsSyncTimerLastActiveTime: number = Date.now();
  private fetcher: StatsigFetcher;
  private dataAdapter: IDataAdapter | null;
  private syncFailureCount = 0;
  private bootstrapValues: string | null;
  private initStrategyForIDLists: InitStrategy;
  private samplingRates: SDKConstants = {
    dcs: 0,
    log: 0,
    idlist: 0,
    initialize: MAX_SAMPLING_RATE,
  };
  private clientSDKKeyToAppMap: Record<string, string> = {};

  public constructor(fetcher: StatsigFetcher, options: ExplicitStatsigOptions) {
    this.fetcher = fetcher;
    this.api = options.api;
    this.apiForDownloadConfigSpecs = options.apiForDownloadConfigSpecs;
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
    this.syncInterval = options.rulesetsSyncIntervalMs;
    this.idListSyncInterval = options.idListsSyncIntervalMs;
    this.initialized = false;
    this.syncTimer = null;
    this.idListsSyncTimer = null;
    this.dataAdapter = options.dataAdapter;
    this.initReason = 'Uninitialized';
    this.bootstrapValues = options.bootstrapValues;
    this.initStrategyForIDLists = options.initStrategyForIDLists;
    this.clientSDKKeyToAppMap = {};
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

  public async init(): Promise<void> {
    let specsJSON = null;

    if (this.dataAdapter) {
      if (this.bootstrapValues != null) {
        OutputLogger.info(
          'statsigSDK::initialize> Conflict between bootstrap and adapter. Defaulting to adapter.',
        );
      }
      await this.dataAdapter.initialize();
      await this._fetchConfigSpecsFromAdapter();
    }

    if (this.initReason === 'Uninitialized' && this.bootstrapValues != null) {
      try {
        Diagnostics.mark.bootstrap.process.start({});
        specsJSON = JSON.parse(this.bootstrapValues);
        this._process(specsJSON);
        if (this.lastUpdateTime !== 0) {
          this.initReason = 'Bootstrap';
        }
      } catch (e) {
        OutputLogger.error(new StatsigInvalidBootstrapValuesError());
      }

      Diagnostics.mark.bootstrap.process.end({
        success: this.initReason === 'Bootstrap',
      });
    }

    if (this.initReason === 'Uninitialized') {
      const { failed } = await this._fetchConfigSpecsFromServer();
      if (failed) {
        OutputLogger.error(new StatsigInitializeFromNetworkError());
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
    const adapter = this.dataAdapter;
    const bootstrapIdLists = await adapter?.get(DataAdapterKey.IDLists);
    if (adapter && typeof bootstrapIdLists?.result === 'string') {
      await this.syncIdListsFromDataAdapter(adapter, bootstrapIdLists.result);
    } else {
      await this.syncIdListsFromNetwork();
    }
  }

  public resetSyncTimerIfExited(): Error | null {
    const syncTimerInactive =
      this.syncTimerLastActiveTime <
      Date.now() - Math.max(SYNC_OUTDATED_MAX, this.syncInterval);
    const idListsSyncTimerInactive =
      this.idListsSyncTimerLastActiveTime <
      Date.now() - Math.max(SYNC_OUTDATED_MAX, this.idListSyncInterval);
    if (!syncTimerInactive && !idListsSyncTimerInactive) {
      return null;
    }
    let message = '';
    if (syncTimerInactive) {
      this.clearSyncTimer();
      message = message.concat(
        `Force reset sync timer. Last update time: ${
          this.syncTimerLastActiveTime
        }, now: ${Date.now()}`,
      );
    }
    if (idListsSyncTimerInactive) {
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
    failed: boolean;
  }> {
    try {
      let response: Response | undefined = undefined;
      const url =
        (this.apiForDownloadConfigSpecs ?? this.api) + '/download_config_specs';
      response = await this.fetcher.post(url, {
        statsigMetadata: getStatsigMetadata(),
        sinceTime: this.lastUpdateTime,
      });

      Diagnostics.mark.downloadConfigSpecs.process.start({});
      const specsString = await response.text();
      if (!this._process(JSON.parse(specsString))) {
        return { synced: false, failed: true };
      }
      this.initReason = 'Network';
      if (
        this.rulesUpdatedCallback != null &&
        typeof this.rulesUpdatedCallback === 'function'
      ) {
        this.rulesUpdatedCallback(specsString, this.lastUpdateTime);
      }
      this._saveConfigSpecsToAdapter(specsString);
      Diagnostics.mark.downloadConfigSpecs.process.end({
        success: this.initReason === 'Network',
      });
      return { synced: true, failed: false };
    } catch (e) {
      if (e instanceof StatsigLocalModeNetworkError) {
        return { synced: false, failed: false };
      }
      OutputLogger.warn(e as Error);
      return { synced: false, failed: true };
    }
  }

  private async _fetchConfigSpecsFromAdapter(): Promise<{
    synced: boolean;
    failed: boolean;
  }> {
    try {
      if (!this.dataAdapter) {
        return { synced: false, failed: false };
      }
      const { result, error } = await this.dataAdapter.get(
        DataAdapterKey.Rulesets,
      );
      if (result && !error) {
        const configSpecs = JSON.parse(result);
        if (this._process(configSpecs)) {
          this.initReason = 'DataAdapter';
          return { synced: true, failed: false };
        }
      }
      return { synced: false, failed: true };
    } catch (e) {
      OutputLogger.warn(e as Error);
      return { synced: false, failed: true };
    }
  }

  private async _saveConfigSpecsToAdapter(specString: string): Promise<void> {
    if (!this.dataAdapter) {
      return;
    }
    await this.dataAdapter.set(
      DataAdapterKey.Rulesets,
      specString,
      this.lastUpdateTime,
    );
  }

  private pollForUpdates() {
    if (this.syncTimer == null) {
      this.syncTimerLastActiveTime = Date.now();
      this.syncTimer = poll(async () => {
        this.syncTimerLastActiveTime = Date.now();
        await this._syncConfigSpecs();
      }, this.syncInterval);
    }

    if (this.idListsSyncTimer == null) {
      this.idListsSyncTimerLastActiveTime = Date.now();
      this.idListsSyncTimer = poll(async () => {
        this.idListsSyncTimerLastActiveTime = Date.now();
        await this._syncIdLists();
      }, this.idListSyncInterval);
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
          samplingRates: this.samplingRates,
        });
        break;
      case 'initialize':
        Diagnostics.logDiagnostics('initialize', {
          type: 'initialize',
          samplingRates: this.samplingRates,
        });
        break;
    }
  }

  private async _syncConfigSpecs(): Promise<void> {
    const adapter = this.dataAdapter;
    const shouldSyncFromAdapter =
      adapter?.supportsPollingUpdatesFor?.(DataAdapterKey.Rulesets) === true;

    const { synced, failed } = shouldSyncFromAdapter
      ? await this._fetchConfigSpecsFromAdapter()
      : await this._fetchConfigSpecsFromServer();
    if (synced) {
      this.syncFailureCount = 0;
    } else if (failed) {
      this.syncFailureCount++;
      if (this.syncFailureCount * this.syncInterval > SYNC_OUTDATED_MAX) {
        OutputLogger.warn(
          `statsigSDK::sync> Syncing the server SDK with ${
            shouldSyncFromAdapter ? 'the data adapter' : 'statsig'
          } has failed for  ${
            this.syncFailureCount * this.syncInterval
          }ms. Your sdk will continue to serve gate/config/experiment definitions as of the last successful sync. See https://docs.statsig.com/messages/serverSDKConnection for more information`,
        );
        this.syncFailureCount = 0;
      }
    }
    this.logDiagnostics('config_sync', 'config_spec');
  }

  private async _syncIdLists(): Promise<void> {
    if (this.initStrategyForIDLists === 'none') {
      return;
    }

    const adapter = this.dataAdapter;
    const shouldSyncFromAdapter =
      adapter?.supportsPollingUpdatesFor?.(DataAdapterKey.IDLists) === true;
    const adapterIdLists = await adapter?.get(DataAdapterKey.IDLists);
    if (shouldSyncFromAdapter && typeof adapterIdLists?.result === 'string') {
      await this.syncIdListsFromDataAdapter(adapter, adapterIdLists.result);
    } else {
      await this.syncIdListsFromNetwork();
    }
    this.logDiagnostics('config_sync', 'id_list');
  }

  private updateSamplingRates(obj: any) {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    this.safeSet(this.samplingRates, 'dcs', obj['dcs']);
    this.safeSet(this.samplingRates, 'idlist', obj['idlist']);
    this.safeSet(this.samplingRates, 'initialize', obj['initialize']);
    this.safeSet(this.samplingRates, 'log', obj['log']);
  }

  private safeSet(
    samplingRates: DiagnosticsSamplingRate,
    key: keyof DiagnosticsSamplingRate,
    value: unknown,
  ) {
    if (typeof value !== 'number') {
      return;
    }
    if (value < 0) {
      samplingRates[key] = 0;
    } else if (value > MAX_SAMPLING_RATE) {
      samplingRates[key] = MAX_SAMPLING_RATE;
    } else {
      samplingRates[key] = value;
    }
  }

  // returns a boolean indicating whether specsJSON has was successfully parsed
  private _process(specsJSON: Record<string, unknown>): boolean {
    if (!specsJSON?.has_updates) {
      return true;
    }

    const updatedGates: Record<string, ConfigSpec> = {};
    const updatedConfigs: Record<string, ConfigSpec> = {};
    const updatedLayers: Record<string, ConfigSpec> = {};
    const gateArray = specsJSON?.feature_gates;
    const configArray = specsJSON?.dynamic_configs;
    const layersArray = specsJSON?.layer_configs;
    const layerToExperimentMap = specsJSON?.layers;
    const samplingRates = specsJSON?.diagnostics;

    this.updateSamplingRates(samplingRates);

    if (
      !Array.isArray(gateArray) ||
      !Array.isArray(configArray) ||
      !Array.isArray(layersArray)
    ) {
      return false;
    }

    for (const gateJSON of gateArray) {
      try {
        const gate = new ConfigSpec(gateJSON);
        updatedGates[gate.name] = gate;
      } catch (e) {
        return false;
      }
    }

    for (const configJSON of configArray) {
      try {
        const config = new ConfigSpec(configJSON);
        updatedConfigs[config.name] = config;
      } catch (e) {
        return false;
      }
    }

    for (const layerJSON of layersArray) {
      try {
        const config = new ConfigSpec(layerJSON);
        updatedLayers[config.name] = config;
      } catch (e) {
        return false;
      }
    }

    const updatedExpToLayer: Record<string, string> =
      this._reverseLayerExperimentMapping(layerToExperimentMap);

    this.store.gates = updatedGates;
    this.store.configs = updatedConfigs;
    this.store.layers = updatedLayers;
    this.store.experimentToLayer = updatedExpToLayer;
    this.lastUpdateTime = (specsJSON.time as number) ?? this.lastUpdateTime;
    this.clientSDKKeyToAppMap = (specsJSON?.sdk_keys_to_app_ids ??
      {}) as Record<string, string>;
    return true;
  }

  /**
   * Returns a reverse mapping of layers to experiment (or vice versa)
   */
  private _reverseLayerExperimentMapping(
    layersMapping: unknown,
  ): Record<string, string> {
    const reverseMapping: Record<string, string> = {};
    if (layersMapping != null && typeof layersMapping === 'object') {
      for (const [layerName, experiments] of Object.entries(
        // @ts-ignore
        layersMapping,
      )) {
        // @ts-ignore
        for (const experimentName of experiments) {
          // experiment -> layer is a 1:1 mapping
          reverseMapping[experimentName] = layerName;
        }
      }
    }
    return reverseMapping;
  }

  private async syncIdListsFromDataAdapter(
    dataAdapter: IDataAdapter,
    listsLookupString: string,
  ): Promise<void> {
    const lookup = IDListUtil.parseBootstrapLookup(listsLookupString);
    if (!lookup) {
      return;
    }

    const tasks: Promise<void>[] = [];
    for (const name of lookup) {
      tasks.push(
        new Promise(async (resolve) => {
          const data = await dataAdapter.get(
            IDListUtil.getIdListDataStoreKey(name),
          );
          if (!data.result) {
            return;
          }

          this.store.idLists[name] = {
            ids: {},
            readBytes: 0,
            url: 'bootstrap',
            fileID: 'bootstrap',
            creationTime: 0,
          };

          IDListUtil.updateIdList(this.store.idLists, name, data.result);
          resolve();
        }),
      );
    }

    await Promise.all(tasks);
  }

  private async syncIdListsFromNetwork(): Promise<void> {
    let response: Response | null = null;
    try {
      response = await this.fetcher.post(this.api + '/get_id_lists', {
        statsigMetadata: getStatsigMetadata(),
      });
    } catch (e) {
      if (!(e instanceof StatsigLocalModeNetworkError)) {
        OutputLogger.warn(e as Error);
      }
    }

    if (!response) {
      return;
    }

    let threwError = false;
    try {
      const json = await response.json();
      const lookup = IDListUtil.parseLookupResponse(json);
      if (!lookup) {
        return;
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
          (lookup.hasOwnProperty(name) &&
            !this.store.idLists.hasOwnProperty(name)) ||
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

      await Promise.allSettled(promises);

      if (this.dataAdapter) {
        await IDListUtil.saveToDataAdapter(
          this.dataAdapter,
          this.store.idLists,
        );
      }
    } catch (e) {
      threwError = true;
    } finally {
      Diagnostics.mark.getIDListSources.process.end({
        success: !threwError,
      });
    }
  }

  private async genFetchIDList(
    name: string,
    url: string,
    readSize: number,
  ): Promise<void> {
    let threwNetworkError = false;
    let res: Response | null = null;
    try {
      Diagnostics.mark.getIDList.networkRequest.start({
        url: url,
      });
      res = await safeFetch(url, {
        method: 'GET',
        headers: {
          Range: `bytes=${readSize}-`,
        },
      });
    } catch (e) {
      threwNetworkError = true;
    } finally {
      Diagnostics.mark.getIDList.networkRequest.end({
        statusCode: res?.status,
        success: res?.ok ?? false,
        url: url,
      });
    }
    if (threwNetworkError || !res) {
      return;
    }
    try {
      Diagnostics.mark.getIDList.process.start({
        url: url,
      });
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
      Diagnostics.mark.getIDList.process.end({
        success: true,
        url: url,
      });
    } catch (e) {
      OutputLogger.warn(e as Error);
      Diagnostics.mark.getIDList.process.end({
        success: false,
        url: url,
      });
    }
  }

  public shutdown(): void {
    this.clearTimers();
    this.dataAdapter?.shutdown();
  }

  private clearSyncTimer(): void {
    if (this.syncTimer != null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private clearIdListsSyncTimer(): void {
    if (this.idListsSyncTimer != null) {
      clearInterval(this.idListsSyncTimer);
      this.idListsSyncTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearSyncTimer();
    this.clearIdListsSyncTimer();
  }

  private setInitialUpdateTime() {
    this.initialUpdateTime =
      this.lastUpdateTime === 0 ? -1 : this.lastUpdateTime;
  }
}

import { ConfigSpec } from './ConfigSpec';
import StatsigOptions from './StatsigOptions';
import StatsigFetcher from './utils/StatsigFetcher';
const { getStatsigMetadata } = require('./utils/core');
import safeFetch from './utils/safeFetch';
import { StatsigLocalModeNetworkError } from './Errors';
import { IDataAdapter } from './interfaces/IDataAdapter';
import { EvaluationReason } from './EvaluationDetails';

const SYNC_OUTDATED_MAX = 120 * 1000;
const STORAGE_ADAPTER_KEY = 'statsig.cache';

type IDList = {
  creationTime: number;
  fileID: string;
  ids: Record<string, boolean>;
  readBytes: number;
  url: string;
};

export type ConfigStore = {
  gates: Record<string, ConfigSpec>;
  configs: Record<string, ConfigSpec>;
  idLists: Record<string, IDList>;
  layers: Record<string, ConfigSpec>;
  experimentToLayer: Record<string, string>;
};

export default class SpecStore {
  private initReason: EvaluationReason;

  private api: string;
  private rulesUpdatedCallback: ((rules: string, time: number) => void) | null;
  private initialUpdateTime: number;
  private lastUpdateTime: number;
  private store: ConfigStore;
  private syncInterval: number;
  private idListSyncInterval: number;
  private initialized: boolean;
  private syncTimer: NodeJS.Timeout | null;
  private idListsSyncTimer: NodeJS.Timeout | null;
  private fetcher: StatsigFetcher;
  private dataAdapter: IDataAdapter | null;
  private syncFailureCount: number = 0;
  private lastDownloadConfigSpecsSyncTime: number = Date.now();

  public constructor(fetcher: StatsigFetcher, options: StatsigOptions) {
    this.fetcher = fetcher;
    this.api = options.api;
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

    var specsJSON = null;
    if (options?.bootstrapValues != null) {
      if (this.dataAdapter != null) {
        console.error(
          'statsigSDK::initialize> Conflict between bootstrap and adapter. Defaulting to adapter.',
        );
      } else {
        try {
          specsJSON = JSON.parse(options.bootstrapValues);
          if (this._process(specsJSON)) {
            this.initReason = 'Bootstrap';
          }
          this.setInitialUpdateTime();
          this.initialized = true;
        } catch (e) {
          console.error(
            'statsigSDK::initialize> the provided bootstrapValues is not a valid JSON string.',
          );
        }
      }
    }
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

  public async init(): Promise<void> {
    // If the provided bootstrapValues can be used to bootstrap the SDK rulesets, then we don't
    // need to wait for _syncValues() to finish before returning.
    if (this.initialized) {
      this._syncValues();
    } else {
      if (this.dataAdapter) {
        await this.dataAdapter.initialize();
        await this._fetchConfigSpecsFromAdapter();
      }
      if (this.lastUpdateTime === 0) {
        await this._syncValues(true);
      }

      this.setInitialUpdateTime();
    }

    await this._syncIDLists();

    this.pollForUpdates();
    this.initialized = true;
  }

  public resetSyncTimerIfExited(): Error | null {
    if (
      this.lastDownloadConfigSpecsSyncTime >=
      Date.now() - SYNC_OUTDATED_MAX
    ) {
      return null;
    }
    this.clearTimers();
    this.pollForUpdates();
    const message = `Force reset sync timer. Last update time: ${
      this.lastDownloadConfigSpecsSyncTime
    }, now: ${Date.now()}`;
    this._fetchConfigSpecsFromServer();
    return new Error(message);
  }

  public isServingChecks() {
    return this.lastUpdateTime !== 0;
  }

  private async _fetchConfigSpecsFromServer(): Promise<void> {
    this.lastDownloadConfigSpecsSyncTime = Date.now();
    const response = await this.fetcher.post(
      this.api + '/download_config_specs',
      {
        statsigMetadata: getStatsigMetadata(),
        sinceTime: this.lastUpdateTime,
      },
    );
    const specsString = await response.text();
    const processResult = this._process(JSON.parse(specsString));
    if (!processResult) {
      return;
    }
    this.initReason = 'Network';
    if (
      this.rulesUpdatedCallback != null &&
      typeof this.rulesUpdatedCallback === 'function'
    ) {
      this.rulesUpdatedCallback(specsString, this.lastUpdateTime);
    }
    this._saveConfigSpecsToAdapter(specsString);
  }

  private async _fetchConfigSpecsFromAdapter(): Promise<void> {
    if (!this.dataAdapter) {
      return;
    }
    const { result, error, time } = await this.dataAdapter.get(
      STORAGE_ADAPTER_KEY,
    );
    if (result && !error) {
      const configSpecs = JSON.parse(result);
      if (this._process(configSpecs)) {
        this.initReason = 'DataAdapter';
      }
    }
  }

  private async _saveConfigSpecsToAdapter(specString: string): Promise<void> {
    if (!this.dataAdapter) {
      return;
    }
    await this.dataAdapter.set(
      STORAGE_ADAPTER_KEY,
      specString,
      this.lastUpdateTime,
    );
  }

  private pollForUpdates() {
    if (this.syncTimer == null) {
      this.syncTimer = setInterval(async () => {
        await this._syncValues();
      }, this.syncInterval).unref();
    }

    if (this.idListsSyncTimer == null) {
      this.idListsSyncTimer = setInterval(async () => {
        await this._syncIDLists();
      }, this.idListSyncInterval).unref();
    }
  }

  private async _syncValues(isColdStart: boolean = false): Promise<void> {
    try {
      await this._fetchConfigSpecsFromServer();
      this.syncFailureCount = 0;
    } catch (e) {
      this.syncFailureCount++;
      if (!(e instanceof StatsigLocalModeNetworkError)) {
        if (isColdStart) {
          console.error(
            'statsigSDK::initialize> Failed to initialize from the network.  See https://docs.statsig.com/messages/serverSDKConnection for more information',
          );
        } else if (
          this.syncFailureCount * this.syncInterval >
          SYNC_OUTDATED_MAX
        ) {
          console.warn(
            `statsigSDK::sync> Syncing the server SDK with statsig has failed for  ${
              this.syncFailureCount * this.syncInterval
            }ms.  Your sdk will continue to serve gate/config/experiment definitions as of the last successful sync.  See https://docs.statsig.com/messages/serverSDKConnection for more information`,
          );
          this.syncFailureCount = 0;
        }
      }
    }
  }

  // returns a boolean indicating whether specsJSON has was successfully parsed
  private _process(specsJSON: Record<string, unknown>): boolean {
    if (!specsJSON?.has_updates) {
      return false;
    }

    const updatedGates: Record<string, ConfigSpec> = {};
    const updatedConfigs: Record<string, ConfigSpec> = {};
    const updatedLayers: Record<string, ConfigSpec> = {};
    const gateArray = specsJSON?.feature_gates;
    const configArray = specsJSON?.dynamic_configs;
    const layersArray = specsJSON?.layer_configs;
    const layerToExperimentMap = specsJSON?.layers;

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

  private async _syncIDLists(): Promise<void> {
    try {
      const response = await this.fetcher.post(this.api + '/get_id_lists', {
        statsigMetadata: getStatsigMetadata(),
      });
      // @ts-ignore
      const parsed = await response.json();
      let promises = [];
      if (typeof parsed === 'object') {
        for (const name in parsed) {
          const url = parsed[name].url;
          const fileID = parsed[name].fileID;
          const newCreationTime = parsed[name].creationTime;
          const oldCreationTime = this.store.idLists[name]?.creationTime ?? 0;
          if (
            typeof url !== 'string' ||
            newCreationTime < oldCreationTime ||
            typeof fileID !== 'string'
          ) {
            continue;
          }
          let newFile =
            fileID !== this.store.idLists[name]?.fileID &&
            newCreationTime >= oldCreationTime;

          if (
            (parsed.hasOwnProperty(name) &&
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
          const fileSize = parsed[name].size ?? 0;
          const readSize = this.store.idLists[name].readBytes ?? 0;
          if (fileSize <= readSize) {
            continue;
          }
          const p = safeFetch(url, {
            method: 'GET',
            headers: {
              Range: `bytes=${readSize}-`,
            },
          })
            // @ts-ignore
            .then((res: Response) => {
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
              return res.text();
            })
            .then((data: string) => {
              const lines = data.split(/\r?\n/);
              if (data.charAt(0) !== '+' && data.charAt(0) !== '-') {
                delete this.store.idLists[name];
                throw new Error('Seek range invalid.');
              }
              for (const line of lines) {
                if (line.length <= 1) {
                  continue;
                }
                const id = line.slice(1).trim();
                if (line.charAt(0) === '+') {
                  this.store.idLists[name].ids[id] = true;
                } else if (line.charAt(0) === '-') {
                  delete this.store.idLists[name].ids[id];
                }
              }
            })
            .catch(() => {});

          promises.push(p);
        }

        // delete any id list that's no longer there
        const deletedLists = [];
        for (const name in this.store.idLists) {
          if (
            this.store.idLists.hasOwnProperty(name) &&
            !parsed.hasOwnProperty(name)
          ) {
            deletedLists.push(name);
          }
        }
        for (const name in deletedLists) {
          delete this.store.idLists[name];
        }
        await Promise.allSettled(promises);
      }
    } catch (e) {}
  }

  public shutdown(): void {
    this.clearTimers();
    this.dataAdapter?.shutdown();
  }

  private clearTimers(): void {
    if (this.syncTimer != null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.idListsSyncTimer != null) {
      clearInterval(this.idListsSyncTimer);
      this.idListsSyncTimer = null;
    }
  }

  private setInitialUpdateTime() {
    this.initialUpdateTime =
      this.lastUpdateTime === 0 ? -1 : this.lastUpdateTime;
  }
}

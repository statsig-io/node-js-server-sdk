import { ConfigSpec } from './ConfigSpec';
import StatsigOptions from './StatsigOptions';
import StatsigFetcher from './utils/StatsigFetcher';
const { getStatsigMetadata } = require('./utils/core');
import safeFetch from './utils/safeFetch';
import { StatsigLocalModeNetworkError } from './Errors';

const SYNC_INTERVAL = 10 * 1000;
const ID_LISTS_SYNC_INTERVAL = 60 * 1000;
const SYNC_OUTDATED_MAX = 120 * 1000;

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
  private api: string;
  private rulesUpdatedCallback: ((rules: string, time: number) => void) | null;
  private time: number;
  private store: ConfigStore;
  private syncInterval: number;
  private idListSyncInterval: number;
  private initialized: boolean;
  private syncTimer: NodeJS.Timer | null;
  private idListsSyncTimer: NodeJS.Timer | null;
  private fetcher: StatsigFetcher;
  private syncFailureCount: number = 0;

  public constructor(
    fetcher: StatsigFetcher,
    options: StatsigOptions,
    syncInterval = SYNC_INTERVAL,
    idListSyncInterval = ID_LISTS_SYNC_INTERVAL,
  ) {
    this.fetcher = fetcher;
    this.api = options.api;
    this.rulesUpdatedCallback = options.rulesUpdatedCallback ?? null;
    this.time = 0;
    this.store = {
      gates: {},
      configs: {},
      idLists: {},
      layers: {},
      experimentToLayer: {},
    };
    this.syncInterval = syncInterval;
    this.idListSyncInterval = idListSyncInterval;
    this.initialized = false;
    this.syncTimer = null;
    this.idListsSyncTimer = null;

    var specsJSON = null;
    if (options?.bootstrapValues != null) {
      try {
        specsJSON = JSON.parse(options.bootstrapValues);
        this._process(specsJSON);
        this.initialized = true;
      } catch (e) {
        console.error(
          'statsigSDK::initialize> the provided bootstrapValues is not a valid JSON string.',
        );
      }
    }
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
      await this._syncValues(true);
    }

    await this._syncIDLists();
    this.initialized = true;
  }

  public isServingChecks() {
    return this.time !== 0;
  }

  private async _syncValues(isColdStart: boolean = false): Promise<void> {
    try {
      const response = await this.fetcher.post(
        this.api + '/download_config_specs',
        {
          statsigMetadata: getStatsigMetadata(),
          sinceTime: this.time,
        },
      );
      const specsString = await response.text();
      const processResult = this._process(JSON.parse(specsString));
      if (processResult) {
        if (
          this.rulesUpdatedCallback != null &&
          typeof this.rulesUpdatedCallback === 'function'
        ) {
          this.rulesUpdatedCallback(specsString, this.time);
        }
      }
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

    this.syncTimer = setTimeout(() => {
      this._syncValues();
    }, this.syncInterval);
  }

  // returns a boolean indicating whether specsJSON has was successfully parsed
  private _process(specsJSON: Record<string, unknown>): boolean {
    if (!specsJSON?.has_updates) {
      return false;
    }

    let parseFailed = false;

    const updatedGates: Record<string, ConfigSpec> = {};
    const updatedConfigs: Record<string, ConfigSpec> = {};
    const updatedLayers: Record<string, ConfigSpec> = {};
    const updatedExpToLayer: Record<string, string> = {};
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
        parseFailed = true;
        break;
      }
    }

    for (const configJSON of configArray) {
      try {
        const config = new ConfigSpec(configJSON);
        updatedConfigs[config.name] = config;
      } catch (e) {
        parseFailed = true;
        break;
      }
    }

    for (const layerJSON of layersArray) {
      try {
        const config = new ConfigSpec(layerJSON);
        updatedLayers[config.name] = config;
      } catch (e) {
        parseFailed = true;
        break;
      }
    }

    if (
      layerToExperimentMap != null &&
      typeof layerToExperimentMap === 'object'
    ) {
      for (const [layerName, experiments] of Object.entries(
        // @ts-ignore
        layerToExperimentMap,
      )) {
        // @ts-ignore
        for (const experimentName of experiments) {
          // experiment -> layer is a 1:1 mapping
          updatedExpToLayer[experimentName] = layerName;
        }
      }
    }

    if (!parseFailed) {
      this.store.gates = updatedGates;
      this.store.configs = updatedConfigs;
      this.store.layers = updatedLayers;
      this.store.experimentToLayer = updatedExpToLayer;
      this.time = (specsJSON.time as number) ?? this.time;
    }
    return !parseFailed;
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

    this.idListsSyncTimer = setTimeout(() => {
      this._syncIDLists();
    }, this.idListSyncInterval);
  }

  public shutdown(): void {
    if (this.syncTimer != null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.idListsSyncTimer != null) {
      clearTimeout(this.idListsSyncTimer);
      this.idListsSyncTimer = null;
    }
  }
}

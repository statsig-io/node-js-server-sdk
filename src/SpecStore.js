const { ConfigSpec } = require('./ConfigSpec');
const fetcher = require('./utils/StatsigFetcher');
const { getStatsigMetadata } = require('./utils/core');
const genericFetch = require('./utils/genericFetch');

const SYNC_INTERVAL = 10 * 1000;
const ID_LISTS_SYNC_INTERVAL = 60 * 1000;

const SpecStore = {
  async init(
    options,
    secretKey,
    syncInterval = SYNC_INTERVAL,
    idListSyncInterval = ID_LISTS_SYNC_INTERVAL,
  ) {
    this.options = options;
    this.api = options.api;
    this.bootstrapValues = options.bootstrapValues;
    this.rulesUpdatedCallback = options.rulesUpdatedCallback;
    this.secretKey = secretKey;
    this.time = 0;
    this.store = { gates: {}, configs: {}, idLists: {}, layers: {} };
    this.syncInterval = syncInterval;
    this.idListSyncInterval = idListSyncInterval;

    var specsJSON = null;
    if (options?.bootstrapValues != null) {
      try {
        specsJSON = JSON.parse(options.bootstrapValues);
      } catch (e) {
        console.error(
          'statsigSDK::initialize> the provided bootstrapValues is not a valid JSON string.',
        );
      }
    }

    // If the provided bootstrapValues can be used to bootstrap the SDK rulesets, then we don't
    // need to wait for _syncValues() to finish before returning.
    if (specsJSON != null && this._process(specsJSON)) {
      this._syncValues();
    } else {
      await this._syncValues();
    }

    await this._syncIDLists();
    this.initialized = true;
  },

  async _syncValues() {
    try {
      const baseApi = this.options._useCdnUrlForDownloadConfigSpecs
        ? this.options._cdnBasedApi
        : this.api;
      const response = await fetcher.post(
        baseApi + '/download_config_specs',
        this.secretKey,
        {
          statsigMetadata: getStatsigMetadata(),
          sinceTime: this.time,
        },
      );
      const specsString = await response.text();
      const processResult = this._process(JSON.parse(specsString));
      if (processResult) {
        this.bootstrapValues = specsString;
        if (
          this.rulesUpdatedCallback != null &&
          typeof this.rulesUpdatedCallback === 'function'
        ) {
          this.rulesUpdatedCallback(specsString, this.time);
        }
      }
    } catch (e) {
      console.error('statsigSDK::sync> Failed while attempting to sync values');
    }

    this.syncTimer = setTimeout(() => {
      this._syncValues();
    }, this.syncInterval);
  },

  // returns a boolean indicating whether specsJSON has was successfully parsed
  _process(specsJSON) {
    if (!specsJSON?.has_updates) {
      return false;
    }

    let parseFailed = false;

    const updatedGates = {};
    const updatedConfigs = {};
    const updatedLayers = {};
    const gateArray = specsJSON?.feature_gates;
    const configArray = specsJSON?.dynamic_configs;
    const layersArray = specsJSON?.layer_configs;

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

    if (!parseFailed) {
      this.store.gates = updatedGates;
      this.store.configs = updatedConfigs;
      this.store.layers = updatedLayers;
      this.time = specsJSON.time ?? this.time;
    }

    return !parseFailed;
  },

  async _syncIDLists() {
    try {
      const response = await fetcher.post(
        this.api + '/get_id_lists',
        this.secretKey,
        {
          statsigMetadata: getStatsigMetadata(),
        },
      );
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
          const p = genericFetch(url, {
            method: 'GET',
            headers: {
              Range: `bytes=${readSize}-`,
            },
          })
            .then((res) => {
              const contentLength = res.headers.get('content-length');
              const length = parseInt(contentLength);
              if (typeof length === 'number') {
                this.store.idLists[name].readBytes += length;
              } else {
                delete this.store.idLists[name];
                throw new Error('Content-Length for the id list is invalid.');
              }
              return res.text();
            })
            .then((data) => {
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

    this.syncTimer = setTimeout(() => {
      this._syncIDLists();
    }, this.idListSyncInterval);
  },

  shutdown() {
    if (this.syncTimer != null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.idListsSyncTimer != null) {
      clearTimeout(this.idListsSyncTimer);
      this.idListsSyncTimer = null;
    }
  },
};

module.exports = SpecStore;

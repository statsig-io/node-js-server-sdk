const { ConfigSpec } = require('./ConfigSpec');
const fetcher = require('./utils/StatsigFetcher');
const fetch = require('node-fetch');
const { getStatsigMetadata } = require('./utils/core');
const { URL } = require('url');

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
    this.store = { gates: {}, configs: {}, idLists: {} };
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
      const baseApi = this.options.useCdnUrlForDownloadConfigSpecs ?
        this.options.cdnBasedApi :
        this.api;
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
      // TODO: log
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
    let updatedGates = {};
    let updatedConfigs = {};
    let parseFailed = false;

    let gateArray = specsJSON?.feature_gates;
    let configArray = specsJSON?.dynamic_configs;
    if (!Array.isArray(gateArray) || !Array.isArray(configArray)) {
      return false;
    }

    for (const gateJSON of specsJSON?.feature_gates) {
      try {
        const gate = new ConfigSpec(gateJSON);
        updatedGates[gate.name] = gate;
      } catch (e) {
        parseFailed = true;
        break;
      }
    }
    for (const configJSON of specsJSON?.dynamic_configs) {
      try {
        const config = new ConfigSpec(configJSON);
        updatedConfigs[config.name] = config;
      } catch (e) {
        parseFailed = true;
        break;
      }
    }

    if (!parseFailed) {
      this.store.gates = updatedGates;
      this.store.configs = updatedConfigs;
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
          const p = fetch(url, {
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

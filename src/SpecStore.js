const { ConfigSpec } = require('./ConfigSpec');
const fetcher = require('./utils/StatsigFetcher');
const { getStatsigMetadata } = require('./utils/core');

const SYNC_INTERVAL = 10 * 1000;
const ID_LISTS_SYNC_INTERVAL = 60 * 1000;

const SpecStore = {
  async init(
    options,
    secretKey,
    syncInterval = SYNC_INTERVAL,
    idListSyncInterval = ID_LISTS_SYNC_INTERVAL,
  ) {
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

    await this._downloadIDLists();
    this.initialized = true;
  },

  async _syncValues() {
    try {
      const response = await fetcher.post(
        this.api + '/download_config_specs',
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
      for (const name in specsJSON?.id_lists) {
        if (
          specsJSON?.id_lists?.hasOwnProperty(name) &&
          !this.store.idLists.hasOwnProperty(name)
        ) {
          this.store.idLists[name] = { ids: {}, time: 0 };
        }
      }
      for (const name in this.store.idLists) {
        if (
          this.store.idLists.hasOwnProperty(name) &&
          !specsJSON?.id_lists.hasOwnProperty(name)
        ) {
          delete this.store.idLists[name];
        }
      }
      this.time = specsJSON.time ?? this.time;
    }

    return !parseFailed;
  },

  async _downloadIDLists() {
    const promises = [];
    for (const name in this.store.idLists) {
      if (this.store.idLists.hasOwnProperty(name)) {
        const p = fetcher
          .post(this.api + '/download_id_list', this.secretKey, {
            listName: name,
            statsigMetadata: getStatsigMetadata(),
            sinceTime: this.store.idLists?.[name]?.time ?? 0,
          })
          .then((response) => {
            return response.json();
          })
          .then((data) => {
            if (this.store.idLists[name] == null) {
              this.store.idLists[name] = { ids: {}, time: 0 };
            }
            const list = this.store.idLists[name];
            // Assuming data is the below format
            // data = {
            //   add_ids: ['1','2','3','4','5'],
            //   remove_ids: ['6','7'], // this will be null/empty if it's the first fetch
            //   time: 123456789,
            // };
            if (Array.isArray(data.add_ids)) {
              for (const id of data.add_ids) {
                list.ids[id] = true;
              }
            }
            if (Array.isArray(data.remove_ids)) {
              for (const id of data.remove_ids) {
                delete list.ids[id];
              }
            }
            list.time = data.time ?? list.time;
          })
          .catch((e) => {});
        promises.push(p);
      }
    }

    await Promise.allSettled(promises);
    this.idListsSyncTimer = setTimeout(() => {
      this._downloadIDLists();
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

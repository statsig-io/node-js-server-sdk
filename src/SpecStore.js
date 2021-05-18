const { ConfigSpec } = require('./ConfigSpec');
const fetcher = require('./utils/StatsigFetcher');
const { getStatsigMetadata } = require('./utils/core');

const SYNC_INTERVAL = 10 * 1000;

const SpecStore = {
  async init(options, secretKey, syncInterval = SYNC_INTERVAL) {
    this.api = options.api;
    this.secretKey = secretKey;
    this.time = Date.now();
    this.store = { gates: {}, configs: {} };
    this.syncInterval = syncInterval;
    try {
      const response = await fetcher.post(
        this.api + '/download_config_specs',
        this.secretKey,
        {
          statsigMetadata: getStatsigMetadata(),
        },
        20
      );
      const specsJSON = await response.json();
      this._process(specsJSON);
    } catch (e) {
      // TODO: log
    }

    this.initialized = true;
    this.syncTimer = setTimeout(() => {
      this._sync();
    }, this.syncInterval);
  },

  async _sync() {
    try {
      const response = await fetcher.post(
        this.api + '/download_config_specs',
        this.secretKey,
        {
          statsigMetadata: getStatsigMetadata(),
          sinceTime: this.time,
        }
      );
      const specsJSON = await response.json();
      this._process(specsJSON);
    } catch (e) {
      // TODO: log
    }

    this.syncTimer = setTimeout(() => {
      this._sync();
    }, this.syncInterval);
  },

  _process(specsJSON) {
    this.time = specsJSON.time ?? this.time;
    if (!specsJSON?.has_updates) {
      return;
    }
    let updatedGates = {};
    let updatedConfigs = {};
    let parseFailed = false;

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
    }
  },

  shutdown() {
    if (this.syncTimer != null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  },
};

module.exports = SpecStore;

const { ConfigSpec } = require('./ConfigSpec');
const fetcher = require('./utils/StatsigFetcher');
const { getStatsigMetadata } = require('./utils/core');

const SYNC_INTERVAL = 10 * 1000;

const SpecStore = {
  async init(options, secretKey, syncInterval = SYNC_INTERVAL) {
    this.api = options.api;
    this.bootstrapValues = options.bootstrapValues;
    this.rulesUpdatedCallback = options.rulesUpdatedCallback;
    this.secretKey = secretKey;
    this.time = 0;
    this.store = { gates: {}, configs: {} };
    this.syncInterval = syncInterval;

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
    this.time = specsJSON.time ?? this.time;
    if (!specsJSON?.has_updates) {
      return false;
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

    return !parseFailed;
  },

  shutdown() {
    if (this.syncTimer != null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  },
};

module.exports = SpecStore;

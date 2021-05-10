const { ConfigSpec } = require('./ConfigSpec');
const ip3country = require('ip3country');
const fetcher = require('./utils/StatsigFetcher');
const { getStatsigMetadata } = require('./utils/core');

const SYNC_INTERVAL = 60 * 1000;

const SpecStore = {
  async init(options, secretKey) {
    this.api = options.api;
    this.secretKey = secretKey;
    this.time = Date.now();
    this.store = { gates: {}, configs: {} };
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
      this.process(specsJSON);
    } catch (e) {
      // TODO: log
    }

    await ip3country.init();

    this.syncTimer = setTimeout(() => {
      this.sync();
    }, SYNC_INTERVAL);
  },

  async sync() {
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
      this.process(specsJSON);
    } catch (e) {
      // TODO: log
    }

    this.syncTimer = setTimeout(() => {
      this.sync();
    }, SYNC_INTERVAL);
  },

  process(specsJSON) {
    this.time = specsJSON.time ?? this.time;
    specsJSON?.feature_gates?.forEach((gateJSON) => {
      try {
        const gate = new ConfigSpec(gateJSON);
        this.store.gates[gate.name] = gate;
      } catch (e) {
        // TODO: log
      }
    });
    specsJSON?.dynamic_configs?.forEach((configJSON) => {
      try {
        const config = new ConfigSpec(configJSON);
        this.store.configs[config.name] = config;
      } catch (e) {
        // TODO: log
      }
    });
  },

  // returns a boolean,
  // or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
  checkGate(user, gateName) {
    if (!(gateName in this.store.gates)) {
      return false;
    }
    return this.store.gates[gateName].evaluate(user);
  },

  // returns a DynamicConfig object, null (if name does not exist),
  // or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
  getConfig(user, configName) {
    if (!(configName in this.store.configs)) {
      return null;
    }
    return this.store.configs[configName].evaluate(user);
  },

  ip2country(ip) {
    try {
      if (typeof ip === 'string') {
        return ip3country.lookupStr(ip);
      } else if (typeof ip === 'number') {
        return ip3country.lookupNumeric(ip);
      }
    } catch (e) {
      // TODO: log
    }
    return null;
  },

  shutdown() {
    if (this.syncTimer != null) {
      clearTimeout(this.syncTimer);
    }
  },
};

module.exports = SpecStore;

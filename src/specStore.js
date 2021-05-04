const { ConfigSpec } = require('./ConfigSpec');
const CountryLookup = require('ip3country');

const specStore = {
  async init(specsJSON) {
    if (specsJSON == null) {
      specsJSON = {};
    }
    const gatesJSON = specsJSON.gates;
    const configsJSON = specsJSON.configs;

    let gates,
      configs = {};
    gatesJSON.forEach((gateJSON) => {
      try {
        gates.insert(new ConfigSpec(gateJSON));
      } catch (e) {}
    });
    configsJSON.forEach((configJSON) => {
      try {
        configs.insert(new ConfigSpec(configJSON));
      } catch (e) {}
    });
    this.store = { gates, configs };
    this.ipTable = new CountryLookup();
    await this.ipTable.init();
  },

  ip2country(ip) {
    if (this.ipTable) {
      try {
        return this.ipTable.lookupStr(ip);
      } catch (e) {}
    }
    return null;
  },
};

module.exports = specStore;

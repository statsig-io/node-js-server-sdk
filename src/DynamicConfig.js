const utils = require('./utils/core');

/**
 * Returns the data for a DynamicConfig in the statsig console via typed get functions
 */
class DynamicConfig {
  constructor(configName, value, ruleID) {
    if (typeof configName !== 'string' || configName.length === 0) {
      configName = '';
    }
    if (value == null || typeof value !== 'object') {
      value = {};
    }
    this.name = configName;
    this.value = utils.clone(value);
    this._ruleID = ruleID;
  }

  /**
   * A generic, type sensitive getter, which returns the value at the given index in the config if it matches the type of the default value,
   * and returns the default value otherwise
   * @template {boolean | number | string | object | any[]} T
   * @param {string} [key] - The index of the config to check
   * @param {T | null} [defaultValue] - The default value of the parameter to return
   * in cases where the parameter is not found or does not match the type of the default value
   * @returns {T | null}
   */
  get(key, defaultValue) {
    if (defaultValue == null) {
      defaultValue = null;
    }
    const val = this.getValue(key, defaultValue);
    if (val == null) {
      return defaultValue;
    }
    if (defaultValue != null) {
      if (Array.isArray(defaultValue) || Array.isArray(val)) {
        if (Array.isArray(defaultValue) && Array.isArray(val)) {
          // @ts-ignore
          return val;
        }
        return defaultValue;
      } else if (typeof defaultValue !== typeof val) {
        return defaultValue;
      }
    }
    return val;
  }

  /**
   * With no parameters, returns the JSON object representing this config (or null if not found)
   * With a key parameter, returns the value at that index in the JSON object, or null if not found
   * With a key and a defaultValue, returns the value at that index, or the provided default if not found
   * @param {string} [key] - The index of the config to check
   * @param {boolean | number | string | object | Array<any> | null} [defaultValue=null] - The default value of the parameter to return in cases where the parameter is not found
   * @returns {boolean | number | string | object | Array<any> | null}
   * @memberof DynamicConfig
   */
  getValue(key, defaultValue = null) {
    if (key == null) {
      return this.value;
    }
    if (defaultValue == null) {
      defaultValue = null;
    }
    return this.value[key] ?? defaultValue;
  }

  /**
   * @ignore
   */
  getRuleID() {
    return this._ruleID;
  }
}

module.exports = { DynamicConfig };

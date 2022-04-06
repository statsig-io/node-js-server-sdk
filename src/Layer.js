const utils = require('./utils/core');

/**
 * Returns the data for a Layer in the statsig console via typed get functions
 */
class Layer {
  /**
   * @param {string} layerName
   * @param {object} value
   * @param {string?} ruleID
   * @param {(layer: Layer, key: string) => void | null} logExposure
   */
  constructor(layerName, value = null, ruleID = '', logExposure = null) {
    if (typeof layerName !== 'string' || layerName.length === 0) {
      layerName = '';
    }
    if (value == null || typeof value !== 'object') {
      value = {};
    }

    this.name = layerName;
    this._value = utils.clone(value);
    this._ruleID = ruleID;
    this._logExposure = logExposure;
  }

  /**
   * A generic, type sensitive getter, which returns the value at the given index in the Layer if it matches the type of the default value,
   * and returns the default value otherwise
   * @template {boolean | number | string | object | any[]} T
   * @param {string} [key] - The key used to lookup the value within the Layer
   * @param {T | null} [defaultValue] - The default value of the parameter to return
   * in cases where the parameter is not found or does not match the type of the default value
   * @returns {T | null}
   */
  get(key, defaultValue, typeGuard = null) {
    if (defaultValue === undefined) {
      defaultValue = null;
    }

    const val = this._value[key];

    if (val == null) {
      return defaultValue;
    }

    const logAndReturn = () => {
      this._logExposure?.(this, key);
      return val;
    };

    if (typeGuard) {
      return typeGuard(val) ? logAndReturn() : defaultValue;
    }

    if (defaultValue == null) {
      return logAndReturn();
    }

    if (
      typeof val === typeof defaultValue &&
      Array.isArray(defaultValue) === Array.isArray(val)
    ) {
      return logAndReturn();
    }

    return defaultValue;
  }

  /**
   * With no parameters, returns the JSON object representing this config (or null if not found)
   * With a key parameter, returns the value at that index in the JSON object, or null if not found
   * With a key and a defaultValue, returns the value at that index, or the provided default if not found
   * @param {string} [key] - The index of the config to check
   * @param {boolean | number | string | object | Array<any> | null} [defaultValue=null] - The default value of the parameter to return in cases where the parameter is not found
   * @returns {boolean | number | string | object | Array<any> | null}
   * @memberof Layer
   */
  getValue(key, defaultValue = null) {
    if (defaultValue === undefined) {
      defaultValue = null;
    }

    if (key == null) {
      return defaultValue;
    }

    if (this._value[key] != null) {
      this._logExposure?.(this, key);
    }

    return this._value[key] ?? defaultValue;
  }

  /**
   * @ignore
   */
  getRuleID() {
    return this._ruleID;
  }
}

module.exports = { Layer };

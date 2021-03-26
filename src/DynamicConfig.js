const utils = require('./utils/core');

function getFallbackConfig(configName) {
  return new DynamicConfig(
    configName ?? 'invalid_config_name',
    {},
    'statsig::invalid_config'
  );
}

/**
 * Returns the data for a DynamicConfig in the statsig console via typed get functions
 */
class DynamicConfig {
  constructor(configName, value, groupName) {
    if (typeof configName !== 'string' || configName.length === 0) {
      configName = '';
    }
    if (value == null) {
      value = {};
    }
    this.name = configName;
    this.value = utils.clone(value);
    this._groupName = groupName;
  }

  /**
   * @ignore
   */
  validateDefault(defaultValue, expectedType) {
    if (defaultValue == null) {
      throw new Error(
        'You must provide a valid default value to check DynamicConfig parameters'
      );
    }

    const givenType = Array.isArray(defaultValue)
      ? 'array'
      : typeof defaultValue;
    if (givenType !== expectedType) {
      throw new Error(
        'Expected type of ' +
          expectedType +
          ' but got ' +
          givenType +
          ' for the default value.'
      );
    }
    return defaultValue;
  }

  /**
   * Returns the boolean value of the given parameter, or the defaultValue if not found.
   * @param {string} name - The name of the parameter to check
   * @param {boolean} [defaultValue=false] - The default value of the parameter to return in cases where the parameter is not found or is not the correct type.
   * @returns {boolean}
   * @throws Error if the provided defaultValue is not a boolean
   * @memberof DynamicConfig
   */
  getBool(name, defaultValue = false) {
    defaultValue = this.validateDefault(defaultValue, 'boolean');
    if (!name || this.value[name] == null) {
      console.warn(
        'statsigSDK::DynamicConfig> ' +
          name +
          ' does not exist in the DynamicConfig, returning the default value.'
      );
      return defaultValue;
    }

    const val = utils.getBoolValue(this.value[name]);
    if (val == null) {
      console.warn(
        'statsigSDK::DynamicConfig> ' +
          name +
          ' is not a boolean. Returning the default value.'
      );
      return defaultValue;
    }
    return val;
  }

  /**
   * Returns the string value of the given parameter, or the defaultValue if not found.
   * @param {string} name - The name of the parameter to check
   * @param {string} [defaultValue=''] - The default value of the parameter to return in cases where the parameter is not found or is not the correct type.
   * @returns {string}
   * @throws Error if the provided defaultValue is not a string
   * @memberof DynamicConfig
   */
  getString(name, defaultValue = '') {
    defaultValue = this.validateDefault(defaultValue, 'string');
    if (!name || this.value[name] == null) {
      console.warn(
        'statsigSDK::DynamicConfig> ' +
          name +
          ' does not exist in the DynamicConfig, returning the default value.'
      );
      return defaultValue;
    }

    let val = this.value[name];
    if (typeof val === 'number' || typeof val === 'boolean') {
      console.warn(
        'statsigSDK::DynamicConfig> ' +
          name +
          ' is not a string, converting and returning it as a string.'
      );
      val = val.toString();
    } else if (typeof val === 'object') {
      console.warn(
        'statsigSDK::DynamicConfig> ' +
          name +
          ' is an object, not string. Returning the default value.'
      );
      return defaultValue;
    }
    return val;
  }

  /**
   * Returns the number value of the given parameter, or the defaultValue if not found.
   * @param {string} name - The name of the parameter to check
   * @param {number} [defaultValue=0] - The default value of the parameter to return in cases where the parameter is not found or is not the correct type.
   * @returns {number}
   * @throws Error if the provided defaultValue is not a number
   * @memberof DynamicConfig
   */
  getNumber(name, defaultValue = 0) {
    defaultValue = this.validateDefault(defaultValue, 'number');
    if (!name || this.value[name] == null) {
      console.warn(
        'statsigSDK::DynamicConfig> ' +
          name +
          ' does not exist in the DynamicConfig, returning the default value.'
      );
      return defaultValue;
    }

    const val = utils.getNumericValue(this.value[name]);
    if (val == null) {
      'statsigSDK::DynamicConfig> ' +
        console.warn(name + ' is not a number. Returning the default value.');
      return defaultValue;
    }
    return val;
  }

  /**
   * Returns the Array value of the given parameter, or the defaultValue if not found.
   * @param {string} name - The name of the parameter to check
   * @param {Array} [defaultValue=[]] - The default value of the parameter to return in cases where the parameter is not found or is not the correct type.
   * @returns {Array}
   * @throws Error if the provided defaultValue is not an Array
   * @memberof DynamicConfig
   */
  getArray(name, defaultValue = []) {
    defaultValue = this.validateDefault(defaultValue, 'array');
    if (!name || this.value[name] == null) {
      'statsigSDK::DynamicConfig> ' +
        console.warn(
          name +
            ' does not exist in the DynamicConfig, returning the default value.'
        );
      return defaultValue;
    }

    const val = this.value[name];
    if (val == null || !Array.isArray(val)) {
      'statsigSDK::DynamicConfig> ' +
        console.warn(name + ' is not an array. Returning the default value.');
      return defaultValue;
    }
    return val;
  }

  /**
   * Returns the object value of the given parameter as another DynamicConfig, or a DynamicConfig representing the defaultValue if not found.
   * @param {string} name - The name of the parameter to check
   * @param {object} [defaultValue={}] - The default value of the parameter to return in cases where the parameter is not found or is not the correct type.
   * @returns {DynamicConfig}
   * @throws Error if the provided defaultValue is not an object
   * @memberof DynamicConfig
   */
  getObject(name, defaultValue = {}) {
    defaultValue = this.validateDefault(defaultValue, 'object');
    if (!name || this.value[name] == null) {
      'statsigSDK::DynamicConfig> ' +
        console.warn(
          name +
            ' does not exist in the DynamicConfig, returning the default value.'
        );
      return new DynamicConfig(name, defaultValue, 'statsig::invalid_config');
    }

    const val = this.value[name];
    if (typeof val !== 'object') {
      'statsigSDK::DynamicConfig> ' +
        console.warn(name + ' is not an object. Returning the default value.');
      return new DynamicConfig(name, defaultValue, 'statsig::invalid_config');
    }
    return new DynamicConfig(name, val, this._groupName);
  }

  /**
   * Returns the raw value of the DynamicConfig
   * @returns {any}
   * @memberof DynamicConfig
   */
  getRawValue() {
    return this.value;
  }

  /**
   * @ignore
   */
  getGroupName() {
    return this._groupName;
  }
}

module.exports = { DynamicConfig, getFallbackConfig };

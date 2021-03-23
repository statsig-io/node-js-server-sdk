/**
 * @namespace typedefs
 */

/**
 * An object of properties relating to a user
 * @typedef {Object<string, *>} StatsigUser
 * @property {string | number} [userID]
 * @property {string} [ip]
 * @property {string} [ua]
 * @property {string} [country]
 * @property {string} [email]
 * @property {string} [username]
 * @property {object} [custom]
 * @memberof typedefs
 */

/**
 * An object of properties for initializing the sdk with advanced options
 * @typedef {Object<string, *>} StatsigOptions
 * @property {string} [api]
 * @memberof typedefs
 */

/**
 * Returns the json object representing this config
 *
 * @callback valueFn
 * @returns {object}
 * @memberof typedefs
 */

/**
 * Returns the boolean representation of the value at the given index in the config
 *
 * @callback getBoolFn
 * @param {string} index
 * @param {boolean} defaultValue
 * @returns {boolean}
 * @memberof typedefs
 */

/**
 * Returns the number representation of the value at the given index in the config
 *
 * @callback getNumberFn
 * @param {string} index
 * @param {number} defaultValue
 * @returns {number}
 * @memberof typedefs
 */

/**
 * Returns the string representation of the value at the given index in the config
 *
 * @callback getStringFn
 * @param {string} index
 * @param {string} defaultValue
 * @returns {string}
 * @memberof typedefs
 */

/**
 * Returns the object representation of the value at the given index in the config
 *
 * @callback getObjectFn
 * @param {string} index
 * @param {object} defaultValue
 * @returns {object}
 * @memberof typedefs
 */

module.exports = {};

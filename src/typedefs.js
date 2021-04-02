/**
 * @namespace typedefs
 */

/**
 * An object of properties relating to the current user
 * Provide as many as possible to take advantage of advanced conditions in the statsig console
 * A dictionary of additional fields can be provided under the "custom" field
 * @typedef {Object.<string, *>} StatsigUser
 * @property {string | number} [userID]
 * @property {string} [email]
 * @property {string} [ip]
 * @property {string} [userAgent]
 * @property {string} [country]
 * @property {string} [locale]
 * @property {string} [clientVersion]
 * @property {Object.<string, string | number | boolean | Array<string>>} [custom]
 * @memberof typedefs
 */

/**
 * An object of properties for initializing the sdk with advanced options
 * @typedef {Object.<string, *>} StatsigOptions
 * @property {string} [api]
 * @memberof typedefs
 */

module.exports = {};

const fetch = require('node-fetch');
const fetcher = require('./utils/StatsigFetcher');
const { DynamicConfig, getFallbackConfig } = require('./DynamicConfig');
const { getStatsigMetadata, isUserIdentifiable } = require('./utils/core');
const {
  logConfigExposure,
  logGateExposure,
  logStatsigInternal,
} = require('./utils/logging');
const LogEvent = require('./LogEvent');
const LogEventProcessor = require('./LogEventProcessor');
const StatsigOptions = require('./StatsigOptions');

const typedefs = require('./typedefs');

const MAX_VALUE_SIZE = 64;
const MAX_OBJ_SIZE = 1024;

/**
 * The global statsig class for interacting with gates, configs, experiments configured in the statsig developer console.  Also used for event logging to view in the statsig console, or for analyzing experiment impacts using pulse.
 */
const statsig = {
  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {typedefs.StatsigOptions} [options={}] - manual sdk configuration for advanced setup
   * @returns {Promise<void>} - a promise which rejects only if you fail to provide a proper SDK Key
   * @throws Error if a Server Secret Key is not provided
   */
  initialize(secretKey, options = {}) {
    if (statsig._ready != null) {
      return Promise.resolve();
    }
    if (
      typeof secretKey !== 'string' ||
      secretKey.length === 0 ||
      !secretKey.startsWith('secret-')
    ) {
      return Promise.reject(
        new Error(
          'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk'
        )
      );
    }
    statsig._ready = false;
    statsig._secretKey = secretKey;
    statsig._options = StatsigOptions(options);
    statsig._logger = LogEventProcessor(statsig._options, statsig._secretKey);
    statsig._ready = true;
    return Promise.resolve();
  },

  /**
   * Check the value of a gate configured in the statsig console
   * @param {typedefs.StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a non-empty string
   */
  checkGate(user, gateName) {
    if (statsig._ready !== true) {
      return Promise.reject(new Error('Must call initialize() first.'));
    }
    if (typeof gateName !== 'string' || gateName.length === 0) {
      return Promise.reject(new Error('Must pass a valid gateName to check'));
    }
    user = trimUserObjIfNeeded(user);
    return this._fetchValues('check_gate', {
      user: user,
      gateName: gateName,
    })
      .then((gate) => {
        const value = gate.value ?? false;
        logGateExposure(user, gateName, value, statsig._logger);
        return Promise.resolve(value);
      })
      .catch(() => {
        logGateExposure(user, gateName, false, statsig._logger);
        return Promise.resolve(false);
      });
  },

  /**
   * Checks the value of a config for a given user
   * @param {typedefs.StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {Promise<DynamicConfig>} - the config for the user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a non-empty string
   */
  getConfig(user, configName) {
    if (statsig._ready !== true) {
      return Promise.reject(new Error('Must call initialize() first.'));
    }
    if (typeof configName !== 'string' || configName.length === 0) {
      return Promise.reject(new Error('Must pass a valid configName to check'));
    }
    user = trimUserObjIfNeeded(user);

    return this._fetchValues('get_config', {
      user: user,
      configName: configName,
    })
      .then((config) => {
        logConfigExposure(user, configName, config.group, statsig._logger);
        return Promise.resolve(
          new DynamicConfig(configName, config.value, config.group)
        );
      })
      .catch(() => {
        logConfigExposure(
          user,
          configName,
          'statsig::invalid_config',
          statsig._logger
        );
        return Promise.resolve(getFallbackConfig());
      });
  },

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   * @param {typedefs.StatsigUser} user - the user associated with this event
   * @param {string} eventName - the name of the event (name = Purchase)
   * @param {string | number} value - the value associated with the event (value = 10)
   * @param {object} metadata - other attributes associated with this event (metadata = {items: 2, currency: USD})
   */
  logEvent(user, eventName, value = null, metadata = null) {
    if (statsig._ready !== true) {
      console.error(
        'statsigSDK::logEvent> Must call initialize() before logEvent().'
      );
      return;
    }
    if (typeof eventName !== 'string' || eventName.length === 0) {
      console.error(
        'statsigSDK::logEvent> Must provide a valid string for the eventName.'
      );
      return;
    }
    if (!isUserIdentifiable(user)) {
      console.warn(
        'statsigSDK::logEvent> A user object with a valid userID was not provided. Event will be logged but not associated with an identifiable user.'
      );
    }
    user = trimUserObjIfNeeded(user);
    if (shouldTrimParam(eventName, MAX_VALUE_SIZE)) {
      console.warn(
        'statsigSDK::logEvent> eventName is too long, trimming to ' +
          MAX_VALUE_SIZE +
          '.'
      );
      eventName = eventName.substring(0, MAX_VALUE_SIZE);
    }
    if (typeof value === 'string' && shouldTrimParam(value, MAX_VALUE_SIZE)) {
      console.warn(
        'statsigSDK::logEvent> value is too long, trimming to ' +
          MAX_VALUE_SIZE +
          '.'
      );
      value = value.substring(0, MAX_VALUE_SIZE);
    }

    if (shouldTrimParam(metadata, MAX_OBJ_SIZE)) {
      console.warn(
        'statsigSDK::logEvent> metadata is too big. Dropping the metadata.'
      );
      metadata = { error: 'not logged due to size too large' };
    }
    let event = new LogEvent(eventName);
    event.setUser(user);
    event.setValue(value);
    event.setMetadata(metadata);
    statsig._logger.log(event);
  },

  /**
   * Checks to see if the SDK is in a ready state to check gates and configs
   * If the SDK is initializing or switching users, it is not in a ready state.
   * @returns {boolean} if the SDK is ready
   */
  isReady: function () {
    return statsig._ready === true;
  },

  /**
   * Informs the statsig SDK that the server is closing or shutting down
   * so the SDK can clean up internal state
   */
  shutdown() {
    if (statsig._logger == null) {
      return;
    }
    statsig._ready = null;
    statsig._logger.flush(false);
    fetcher.shutdown();
  },

  _fetchValues(endpoint, input) {
    return fetcher.postWithTimeout(
      statsig._options.api + '/' + endpoint,
      statsig._secretKey,
      Object.assign(input, {
        statsigMetadata: getStatsigMetadata(),
      }),
      (resJSON) => {
        return Promise.resolve(resJSON);
      },
      (e) => {
        logStatsigInternal(
          input.user,
          endpoint + '_failed',
          { error: e?.message || '_fetchValuesFailed' },
          statsig.logger
        );
        return Promise.reject();
      },
      3000,
      3
    );
  },
};

function shouldTrimParam(obj, size) {
  if (obj == null) return false;
  if (typeof obj === 'string') return obj.length > size;
  if (typeof obj === 'object') {
    return JSON.stringify(obj).length > size;
  }
  if (typeof obj === 'number') return obj.toString().length > size;
  return false;
}

function trimUserObjIfNeeded(user) {
  if (user == null) return user;
  if (shouldTrimParam(user.userID, MAX_VALUE_SIZE)) {
    console.warn(
      'statsigSDK> User ID is too large, trimming to ' + MAX_VALUE_SIZE
    );
    user.userID = user.userID.toString().substring(0, MAX_VALUE_SIZE);
  }
  if (shouldTrimParam(user, MAX_OBJ_SIZE)) {
    user.custom = {};
    if (shouldTrimParam(user, MAX_OBJ_SIZE)) {
      console.warn(
        'statsigSDK> User object is too large, only keeping the user ID.'
      );
      user = { userID: user.userID };
    } else {
      console.warn(
        'statsigSDK> User object is too large, dropping the custom property.'
      );
    }
  }
  return user;
}

module.exports = statsig;

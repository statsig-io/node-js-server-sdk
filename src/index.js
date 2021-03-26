const fetch = require('node-fetch');
const fetcher = require('./utils/StatsigFetcher');
const { DynamicConfig, getFallbackConfig } = require('./DynamicConfig');
const InternalStore = require('./InternalStore');
const {
  getNumericValue,
  getStatsigMetadata,
  isUserIdentifiable,
} = require('./utils/core');
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
    statsig._store = InternalStore(
      secretKey,
      statsig._logger,
      statsig._options
    );
    statsig._ready = true;

    const params = {
      sdkKey: secretKey,
      statsigMetadata: getStatsigMetadata(),
    };
    fetch(statsig._options.api + '/initialize', {
      method: 'POST',
      body: JSON.stringify(params),
      headers: { 'Content-type': 'application/json; charset=UTF-8' },
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error(response.statusText);
      })
      .then((responseJSON) => {
        const sdkParams = responseJSON?.sdkParams;
        if (sdkParams != null && typeof sdkParams === 'object') {
          if (statsig._logger != null) {
            const flushInterval = getNumericValue(sdkParams?.flushInterval);
            if (flushInterval != null) {
              statsig._logger.setFlushInterval(flushInterval);
            }

            const flushBatchSize = getNumericValue(sdkParams?.flushBatchSize);
            if (flushInterval != null) {
              statsig._logger.setFlushBatchSize(flushBatchSize);
            }

            const maxEventQueueSize = getNumericValue(
              sdkParams?.maxEventQueueSize
            );
            if (maxEventQueueSize != null) {
              statsig._logger.setMaxEventQueueSize(maxEventQueueSize);
            }
          }
          if (statsig._store != null) {
            const fetchTimeout = getNumericValue(sdkParams?.fetchTimeout);
            if (fetchTimeout != null) {
              statsig._store.setFetchTimeout(fetchTimeout);
            }

            const fetchRetry = getNumericValue(sdkParams?.fetchRetry);
            if (fetchRetry != null) {
              statsig._store.setFetchRetry(fetchRetry);
            }
          }
        }
      })
      .catch((e) => {
        logStatsigInternal(
          null,
          'initialize_failed',
          { error: e.message },
          statsig._logger
        );
      });
    return Promise.resolve();
  },

  /**
   * Check the value of a gate configured in the statsig console
   * @param {typedefs.StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   * @throws Error if initialize() was not called first
   * @throws Error if the gateName is not provided or not a string
   */
  checkGate(user, gateName) {
    if (statsig._ready !== true) {
      return Promise.reject(new Error('Must call initialize() first.'));
    }
    if (typeof gateName !== 'string') {
      return Promise.reject(new Error('Must pass a valid gateName to check'));
    }
    user = trimUserObjIfNeeded(user);
    return statsig._store
      .checkGate(user, gateName)
      .then((value) => {
        logGateExposure(user, gateName, value, statsig._logger);
        return Promise.resolve(value);
      })
      .catch((e) => {
        logGateExposure(user, gateName, false, statsig._logger);
        console.warn(e.message + ' Returning false as the default value.');
        return Promise.resolve(false);
      });
  },

  /**
   * Checks the value of a config for a given user
   * @param {typedefs.StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {Promise<DynamicConfig>} - the config for the user
   * @throws Error if initialize() was not called first
   * @throws Error if the configName is not provided or not a string
   */
  getConfig(user, configName) {
    if (statsig._ready !== true) {
      return Promise.reject(new Error('Must call initialize() first.'));
    }
    if (typeof configName !== 'string') {
      return Promise.reject(new Error('Must pass a valid configName to check'));
    }
    user = trimUserObjIfNeeded(user);

    return statsig._store
      .getConfig(user, configName)
      .then((config) => {
        logConfigExposure(
          user,
          configName,
          config.getGroupName(),
          statsig._logger
        );
        return Promise.resolve(config);
      })
      .catch((e) => {
        logConfigExposure(
          user,
          configName,
          'statsig::invalid_config',
          statsig._logger
        );
        console.warn(
          e.message + ' The config will only return the default values.'
        );
        return Promise.resolve(getFallbackConfig(configName));
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
      console.error('Must call initialize() before logEvent().');
      return;
    }
    if (typeof eventName !== 'string' || eventName.length === 0) {
      console.error('Must provide a valid string for the eventName.');
      return;
    }
    if (!isUserIdentifiable(user)) {
      console.warn(
        'A user object with a valid userID was not provided. Event will be logged but not associated with an identifiable user.'
      );
    }
    user = trimUserObjIfNeeded(user);
    if (shouldTrimParam(eventName, MAX_VALUE_SIZE)) {
      console.warn(
        'eventName is too long, trimming to ' + MAX_VALUE_SIZE + '.'
      );
      eventName = eventName.substring(0, MAX_VALUE_SIZE);
    }
    if (typeof value === 'string' && shouldTrimParam(value, MAX_VALUE_SIZE)) {
      console.warn('value is too long, trimming to ' + MAX_VALUE_SIZE + '.');
      value = value.substring(0, MAX_VALUE_SIZE);
    }

    if (shouldTrimParam(metadata, MAX_OBJ_SIZE)) {
      console.warn('metadata is too big. Dropping the metadata.');
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
    console.warn('User ID is too large, trimming to ' + MAX_VALUE_SIZE);
    user.userID = user.userID.toString().substring(0, MAX_VALUE_SIZE);
  }
  if (shouldTrimParam(user, MAX_OBJ_SIZE)) {
    user.custom = {};
    if (shouldTrimParam(user, MAX_OBJ_SIZE)) {
      console.warn('User object is too large, only keeping the user ID.');
      user = { userID: user.userID };
    } else {
      console.warn('User object is too large, dropping the custom property.');
    }
  }
  return user;
}

module.exports = statsig;

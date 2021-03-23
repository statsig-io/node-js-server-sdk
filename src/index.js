const fetch = require('node-fetch');
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

const statsig = {
  /**
   * Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.
   * @param {string} secretKey - The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations
   * @param {typedefs.StatsigOptions} options - manual sdk configuration for advanced setup
   * @returns {Promise<void>} - a promise which rejects only if you fail to provide a proper SDK Key
   */
  initialize(secretKey, options = {}) {
    if (statsig.isReady != null) {
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
    statsig.isReady = false;
    statsig.secretKey = secretKey;
    statsig.options = StatsigOptions(options);
    statsig.logger = LogEventProcessor(statsig.options, statsig.secretKey);
    statsig.store = InternalStore(secretKey, statsig.logger, statsig.options);
    statsig.isReady = true;

    const params = {
      sdkKey: secretKey,
      statsigMetadata: getStatsigMetadata(),
    };
    fetch(statsig.options.api + '/initialize', {
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
          if (statsig.logger != null) {
            const flushInterval = getNumericValue(sdkParams?.flushInterval);
            if (flushInterval != null) {
              statsig.logger.setFlushInterval(flushInterval);
            }

            const flushBatchSize = getNumericValue(sdkParams?.flushBatchSize);
            if (flushInterval != null) {
              statsig.logger.setFlushBatchSize(flushBatchSize);
            }

            const maxEventQueueSize = getNumericValue(
              sdkParams?.maxEventQueueSize
            );
            if (maxEventQueueSize != null) {
              statsig.logger.setMaxEventQueueSize(maxEventQueueSize);
            }
          }
          if (statsig.store != null) {
            const fetchTimeout = getNumericValue(sdkParams?.fetchTimeout);
            if (fetchTimeout != null) {
              statsig.store.setFetchTimeout(fetchTimeout);
            }

            const fetchRetry = getNumericValue(sdkParams?.fetchRetry);
            if (fetchRetry != null) {
              statsig.store.setFetchRetry(fetchRetry);
            }
          }
        }
      })
      .catch((e) => {
        logStatsigInternal(
          null,
          'initialize_failed',
          { error: e.message },
          statsig.logger
        );
      });
    return Promise.resolve();
  },

  /**
   * Check the value of a gate configured in the statsig console
   * @param {typedefs.StatsigUser} user - the user to check this gate value for
   * @param {string} gateName - the name of the gate to check
   * @returns {Promise<boolean>} - The value of the gate for the user.  Gates are off (return false) by default
   */
  checkGate(user, gateName) {
    if (statsig.isReady !== true) {
      return Promise.reject(new Error('Must call initialize() first.'));
    }
    user = trimUserObjIfNeeded(user);
    return statsig.store
      .checkGate(user, gateName)
      .then((value) => {
        logGateExposure(user, gateName, value, statsig.logger);
        return Promise.resolve(value);
      })
      .catch((e) => {
        logGateExposure(user, gateName, false, statsig.logger);
        console.warn(e.message + ' Returning false as the default value.');
        return Promise.resolve(false);
      });
  },

  /**
   * Checks the value of a config for a given user
   * @param {typedefs.StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} configName - the name of the dynamic config to get
   * @returns {Promise<DynamicConfig>} - the config for the user
   */
  getConfig(user, configName) {
    if (statsig.isReady !== true) {
      return Promise.reject(new Error('Must call initialize() first.'));
    }
    user = trimUserObjIfNeeded(user);

    return statsig.store
      .getConfig(user, configName)
      .then((config) => {
        logConfigExposure(
          user,
          configName,
          config.getGroupName(),
          statsig.logger
        );
        return Promise.resolve(config);
      })
      .catch((e) => {
        logConfigExposure(
          user,
          configName,
          'statsig::invalid_config',
          statsig.logger
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
    if (statsig.isReady !== true) {
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
    statsig.logger.log(event);
  },

  /**
   * Informs the statsig SDK that the server is closing or shutting down
   * so the SDK can clean up internal state
   */
  shutdown() {
    if (statsig.logger == null) {
      return;
    }
    statsig.logger.flush();
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

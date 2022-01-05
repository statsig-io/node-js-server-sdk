const fetcher = require('./utils/StatsigFetcher');
const { DynamicConfig } = require('./DynamicConfig');
const { getStatsigMetadata, isUserIdentifiable } = require('./utils/core');
const LogEvent = require('./LogEvent');
const LogEventProcessor = require('./LogEventProcessor');
const Evaluator = require('./Evaluator');
const StatsigOptions = require('./StatsigOptions');

const typedefs = require('./typedefs');
const { FETCH_FROM_SERVER } = require('./ConfigSpec');

const MAX_VALUE_SIZE = 64;
const MAX_OBJ_SIZE = 1024;
let hasLoggedNoUserIdWarning = false;

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
    if (statsig._pendingInitPromise) {
      return statsig._pendingInitPromise;
    }

    if (statsig._ready === true) {
      return Promise.resolve();
    }

    if (
      typeof secretKey !== 'string' ||
      secretKey.length === 0 ||
      !secretKey.startsWith('secret-')
    ) {
      return Promise.reject(
        new Error(
          'Invalid key provided.  You must use a Server Secret Key from the Statsig console with the node-js-server-sdk',
        ),
      );
    }
    statsig._ready = false;
    statsig._secretKey = secretKey;
    statsig._options = StatsigOptions(options);
    fetcher.setLocal(statsig._options.localMode);
    statsig._logger = LogEventProcessor(statsig._options, statsig._secretKey);

    statsig._pendingInitPromise = Evaluator.init(
      statsig._options,
      statsig._secretKey,
    ).finally(() => {
      statsig._ready = true;
      statsig._pendingInitPromise = null;
    });
    return statsig._pendingInitPromise;
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
    if (!isUserValid(user)) {
      return Promise.reject(
        new Error(
          'Must pass a valid user with a userID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
        ),
      );
    }
    user = normalizeUser(user);
    return this._getGateValue(user, gateName).then((gate) => {
      return gate.value;
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
    if (!isUserValid(user)) {
      return Promise.reject(
        new Error(
          'Must pass a valid user with a userID for the server SDK to work. See https://docs.statsig.com/messages/serverRequiredUserID/ for more details.',
        ),
      );
    }
    user = normalizeUser(user);

    return this._getConfigValue(user, configName);
  },

  /**
   * Checks the value of a config for a given user
   * @param {typedefs.StatsigUser} user - the user to evaluate for the dyamic config
   * @param {string} experimentName - the name of the experiment to get
   * @returns {Promise<DynamicConfig>} - the experiment for the user, represented by a Dynamic Config
   * @throws Error if initialize() was not called first
   * @throws Error if the experimentName is not provided or not a non-empty string
   */
  getExperiment(user, experimentName) {
    if (typeof experimentName !== 'string' || experimentName.length === 0) {
      return Promise.reject(
        new Error('Must pass a valid experimentName to check'),
      );
    }
    return this.getConfig(user, experimentName);
  },

  /**
   * Log an event for data analysis and alerting or to measure the impact of an experiment
   * @param {typedefs.StatsigUser} user - the user associated with this event
   * @param {string} eventName - the name of the event (name = Purchase)
   * @param {?string | number} value - the value associated with the event (value = 10)
   * @param {?Record<string, string>} metadata - other attributes associated with this event (metadata = {item_name: 'banana', currency: 'USD'})
   * @throws Error if initialize() was not called first
   */
  logEvent(user, eventName, value = null, metadata = null) {
    this.logEventObject({
      eventName: eventName,
      user: user,
      value: value,
      metadata: metadata,
    });
  },

  logEventObject(eventObject) {
    let eventName = eventObject.eventName;
    let user = eventObject.user || null;
    let value = eventObject.value || null;
    let metadata = eventObject.metadata || null;
    let time = eventObject.time || null;

    if (statsig._ready == null) {
      throw new Error(
        'statsigSDK::logEvent> Must call initialize() before logEvent().',
      );
    }
    if (typeof eventName !== 'string' || eventName.length === 0) {
      console.error(
        'statsigSDK::logEvent> Must provide a valid string for the eventName.',
      );
      return;
    }
    if (!isUserIdentifiable(user) && !hasLoggedNoUserIdWarning) {
      hasLoggedNoUserIdWarning = true;
      console.warn(
        'statsigSDK::logEvent> No valid userID was provided. Event will be logged but not associated with an identifiable user. This message is only logged once.',
      );
    }
    user = normalizeUser(user);
    if (shouldTrimParam(eventName, MAX_VALUE_SIZE)) {
      console.warn(
        'statsigSDK::logEvent> eventName is too long, trimming to ' +
          MAX_VALUE_SIZE +
          '.',
      );
      eventName = eventName.substring(0, MAX_VALUE_SIZE);
    }
    if (typeof value === 'string' && shouldTrimParam(value, MAX_VALUE_SIZE)) {
      console.warn(
        'statsigSDK::logEvent> value is too long, trimming to ' +
          MAX_VALUE_SIZE +
          '.',
      );
      value = value.substring(0, MAX_VALUE_SIZE);
    }

    if (shouldTrimParam(metadata, MAX_OBJ_SIZE)) {
      console.warn(
        'statsigSDK::logEvent> metadata is too big. Dropping the metadata.',
      );
      metadata = { error: 'not logged due to size too large' };
    }

    let event = new LogEvent(eventName);
    event.setUser(user);
    event.setValue(value);
    event.setMetadata(metadata);

    if (typeof time === 'number') {
      event.setTime(time);
    }

    statsig._logger.log(event);
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
    Evaluator.shutdown();
  },

  _getGateValue(user, gateName) {
    let ret = Evaluator.checkGate(user, gateName);
    if (ret == null) {
      ret = {
        value: false,
        rule_id: '',
        secondary_exposures: [],
      };
    }
    if (ret !== FETCH_FROM_SERVER) {
      statsig._logger.logGateExposure(
        user,
        gateName,
        ret.value,
        ret.rule_id,
        ret.secondary_exposures,
      );
      return Promise.resolve(ret);
    }

    return fetcher
      .dispatch(
        statsig._options.api + '/check_gate',
        statsig._secretKey,
        Object.assign({
          user: user,
          gateName: gateName,
          statsigMetadata: getStatsigMetadata(),
        }),
        5000,
      )
      .then((res) => {
        return res.json();
      });
  },

  _getConfigValue(user, configName) {
    let config = Evaluator.getConfig(user, configName);
    if (config == null) {
      config = new DynamicConfig(configName);
    }
    if (config !== FETCH_FROM_SERVER) {
      statsig._logger.logConfigExposure(
        user,
        configName,
        config.getRuleID(),
        config._getSecondaryExposures(),
      );
      return Promise.resolve(config);
    }

    return fetcher
      .dispatch(
        statsig._options.api + '/get_config',
        statsig._secretKey,
        {
          user: user,
          configName: configName,
          statsigMetadata: getStatsigMetadata(),
        },
        5000,
      )
      .then((res) => {
        return res.json();
      })
      .then((resJSON) => {
        return Promise.resolve(
          new DynamicConfig(configName, resJSON.value, resJSON.rule_id),
        );
      });
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

function isUserValid(user) {
  return (
    user != null &&
    typeof user === 'object' &&
    (typeof user.userID === 'string' || typeof user.userID === 'number')
  );
}

function normalizeUser(user) {
  user = trimUserObjIfNeeded(user);
  if (statsig._options?.environment != null) {
    user['statsigEnvironment'] = statsig._options?.environment;
  }
  return user;
}

function trimUserObjIfNeeded(user) {
  if (user == null) return {};
  if (shouldTrimParam(user.userID, MAX_VALUE_SIZE)) {
    console.warn(
      'statsigSDK> User ID is too large, trimming to ' + MAX_VALUE_SIZE,
    );
    user.userID = user.userID.toString().substring(0, MAX_VALUE_SIZE);
  }
  if (shouldTrimParam(user, MAX_OBJ_SIZE)) {
    user.custom = {};
    if (shouldTrimParam(user, MAX_OBJ_SIZE)) {
      console.warn(
        'statsigSDK> User object is too large, only keeping the user ID.',
      );
      user = { userID: user.userID };
    } else {
      console.warn(
        'statsigSDK> User object is too large, dropping the custom property.',
      );
    }
  }
  return user;
}

module.exports = statsig;

const { DynamicConfig, getFallbackConfig } = require('./DynamicConfig');
const fetcher = require('./utils/StatsigFetcher');
const { getStatsigMetadata, isUserIdentifiable } = require('./utils/core');
const { logStatsigInternal } = require('./utils/logging');

const fetch = require('node-fetch');
const hash = require('object-hash');

function InternalStore(secretKey, logger, options) {
  let store = {};
  store.cache = {};
  store.pendingPromises = {};
  let fetchTimout = 3000;
  let fetchRetry = 5;

  store.setFetchTimeout = function (timeout) {
    fetchTimout = timeout;
  };

  store.setFetchRetry = function (retry) {
    fetchRetry = retry;
  };

  store.checkGate = function (user, gateName) {
    if (typeof gateName !== 'string' || gateName.length === 0) {
      return Promise.reject(new Error('gateName must be a valid string.'));
    }

    if (!isUserIdentifiable(user)) {
      console.warn('A user with a valid userID is not provided.');
    }

    const userHash = hash(user);
    if (!store.cache[userHash]) {
      // user value not fetched yet
      return fetchValues(user).then(() => {
        return Promise.resolve(store.cache[userHash]?.gates[gateName] ?? false);
      });
    }

    return Promise.resolve(store.cache[userHash]?.gates[gateName] ?? false);
  };

  store.getConfig = function (user, configName) {
    if (typeof configName !== 'string' || configName.length === 0) {
      return Promise.reject(new Error('configName is not a valid string.'));
    }

    if (!isUserIdentifiable(user)) {
      console.warn('A user with a valid userID is not provided.');
    }

    const userHash = hash(user);
    if (!store.cache[userHash]) {
      // user value not fetched yet
      return fetchValues(user).then(() => {
        return Promise.resolve(
          store.cache[userHash]?.configs[configName] ??
            getFallbackConfig(configName)
        );
      });
    }

    return Promise.resolve(
      store.cache[userHash]?.configs[configName] ??
        getFallbackConfig(configName)
    );
  };

  function fetchValues(user) {
    const userHash = hash(user);
    const pendingPromise = store.pendingPromises[userHash];
    if (pendingPromise) {
      return pendingPromise.finally(() => {
        delete store.pendingPromises[userHash];
        return fetchValues(user);
      });
    }
    store.pendingPromises[userHash] = fetcher.postWithTimeout(
      options.api + '/initialize',
      {
        sdkKey: secretKey,
        user: user,
        statsigMetadata: getStatsigMetadata(),
      },
      (resJSON) => {
        store.cache[userHash] = {
          gates: resJSON?.gates ?? {},
          configs: parseConfigs(resJSON?.configs),
        };
      },
      (e) => {
        logStatsigInternal(
          user,
          'fetch_gates_failed',
          { error: e.message },
          logger
        );
      },
      fetchTimout,
      fetchRetry
    );
    return store.pendingPromises[userHash];
  }

  function parseConfigs(configs) {
    if (typeof configs !== 'object' || configs == null) {
      return {};
    }
    let parsed = {};
    for (const configName in configs) {
      if (configName && configs[configName]) {
        parsed[configName] = new DynamicConfig(
          configName,
          configs[configName].value,
          configs[configName].group
        );
      }
    }
    return parsed;
  }

  return store;
}

module.exports = InternalStore;

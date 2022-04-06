const { getStatsigMetadata } = require('./utils/core');
const LogEvent = require('./LogEvent');
const fetcher = require('./utils/StatsigFetcher');

const CONFIG_EXPOSURE_EVENT = 'config_exposure';
const LAYER_EXPOSURE_EVENT = 'layer_exposure';
const GATE_EXPOSURE_EVENT = 'gate_exposure';
const INTERNAL_EVENT_PREFIX = 'statsig::';

function LogEventProcessor(options, secretKey) {
  const processor = {};
  let flushBatchSize = 1000;
  let flushInterval = 60 * 1000;
  let deduperInterval = 60 * 1000;
  let queue = [];
  let flushTimer = setInterval(function () {
    processor.flush();
  }, flushInterval);
  let deduperTimer = setInterval(function () {
    deduper.clear();
  }, deduperInterval);
  let loggedErrors = new Set();
  let deduper = new Set();

  processor.log = function (event, errorKey = null) {
    if (options.localMode) {
      return;
    }
    if (!(event instanceof LogEvent)) {
      return;
    }

    if (!event.validate()) {
      return;
    }

    if (errorKey != null) {
      if (loggedErrors.has(errorKey)) {
        return;
      }
      loggedErrors.add(errorKey);
    }

    queue.push(event);
    if (queue.length >= flushBatchSize) {
      processor.flush();
    }
  };

  processor.flush = function (waitForResponse = true) {
    if (!waitForResponse) {
      clearInterval(flushTimer);
      clearInterval(deduperTimer);
    }

    if (queue.length === 0) {
      return;
    }
    const oldQueue = queue;
    queue = [];
    const body = {
      statsigMetadata: getStatsigMetadata(),
      events: oldQueue,
    };

    if (!waitForResponse) {
      // we are exiting, fire and forget
      fetcher
        .post(options.api + '/log_event', secretKey, body, 0)
        .catch((e) => {});
      return;
    }

    fetcher
      .post(options.api + '/log_event', secretKey, body, 5, 10000)
      .catch((e) => {
        processor.logStatsigInternal(null, 'log_event_failed', {
          error: e?.message || 'log_event_failed',
        });
      });
  };

  processor.logStatsigInternal = function (
    user,
    eventName,
    metadata,
    secondaryExposures,
  ) {
    if (!processor.isUniqueExposure(user, eventName, metadata)) {
      return;
    }

    let event = new LogEvent(INTERNAL_EVENT_PREFIX + eventName);
    if (user != null) {
      event.setUser(user);
    }

    if (metadata != null) {
      event.setMetadata(metadata);
    }

    if (secondaryExposures != null) {
      event.setSecondaryExposures(secondaryExposures);
    }

    if (metadata?.error != null) {
      processor.log(event, eventName + metadata.error);
    } else {
      processor.log(event);
    }
  };

  processor.logGateExposure = function (
    user,
    gateName,
    gateValue,
    ruleID = '',
    secondaryExposures = [],
  ) {
    processor.logStatsigInternal(
      user,
      GATE_EXPOSURE_EVENT,
      {
        gate: gateName,
        gateValue: String(gateValue),
        ruleID: ruleID,
      },
      secondaryExposures,
    );
  };

  processor.logConfigExposure = function (
    user,
    configName,
    ruleID = '',
    secondaryExposures = [],
  ) {
    processor.logStatsigInternal(
      user,
      CONFIG_EXPOSURE_EVENT,
      {
        config: configName,
        ruleID: ruleID,
      },
      secondaryExposures,
    );
  };

  processor.logLayerExposure = function (
    user,
    layer,
    parameterName,
    configEvaluation,
  ) {
    let allocatedExperiment = '';
    let exposures = configEvaluation.undelegated_secondary_exposures;
    const isExplicit =
      configEvaluation.explicit_parameters?.includes(parameterName) ?? false;
    if (isExplicit) {
      allocatedExperiment = configEvaluation.config_delegate;
      exposures = configEvaluation.secondary_exposures;
    }

    processor.logStatsigInternal(
      user,
      LAYER_EXPOSURE_EVENT,
      {
        config: layer.name,
        ruleID: layer._ruleID,
        allocatedExperiment: allocatedExperiment,
        parameterName,
        isExplicitParameter: String(isExplicit),
      },
      exposures,
    );
  };

  processor.isUniqueExposure = function (user, eventName, metadata) {
    let customIdKey = '';
    if (user.customIDs && typeof user.customIDs === 'object') {
      customIdKey = Object.values(user.customIDs).join();
    }

    let metadataKey = '';
    if (metadata && typeof metadata === 'object') {
      customIdKey = Object.values(metadata).join();
    }

    const keyList = [user.userID, customIdKey, eventName, metadataKey];
    const key = keyList.join();
    if (deduper.has(key)) {
      return false;
    }

    deduper.add(key);
    if (deduper.size > 100000) {
      deduper.clear();
    }
    return true;
  };

  return processor;
}

module.exports = LogEventProcessor;

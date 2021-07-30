const { getStatsigMetadata } = require('./utils/core');
const LogEvent = require('./LogEvent');
const fetcher = require('./utils/StatsigFetcher');

const CONFIG_EXPOSURE_EVENT = 'config_exposure';
const GATE_EXPOSURE_EVENT = 'gate_exposure';
const INTERNAL_EVENT_PREFIX = 'statsig::';

function LogEventProcessor(options, secretKey) {
  const processor = {};
  let flushBatchSize = 500;
  let flushInterval = 60 * 1000;
  let queue = [];
  let flushTimer = setInterval(function () {
    processor.flush();
  }, flushInterval);
  let loggedErrors = new Set();

  processor.log = function (event, errorKey = null) {
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

  processor.logStatsigInternal = function (user, eventName, metadata) {
    let event = new LogEvent(INTERNAL_EVENT_PREFIX + eventName);
    if (user != null) {
      event.setUser(user);
    }

    if (metadata != null) {
      event.setMetadata(metadata);
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
  ) {
    processor.logStatsigInternal(user, GATE_EXPOSURE_EVENT, {
      gate: gateName,
      gateValue: String(gateValue),
      ruleID: ruleID,
    });
  };

  processor.logConfigExposure = function (user, configName, ruleID = '') {
    processor.logStatsigInternal(user, CONFIG_EXPOSURE_EVENT, {
      config: configName,
      ruleID: ruleID,
    });
  };

  return processor;
}

module.exports = LogEventProcessor;

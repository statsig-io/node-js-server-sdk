const fetch = require('node-fetch');
const { getStatsigMetadata } = require('./utils/core');
const LogEvent = require('./LogEvent');
const { logStatsigInternal } = require('./utils/logging');
const fetcher = require('./utils/StatsigFetcher');

function LogEventProcessor(options, secretKey) {
  const processor = {};
  let flushBatchSize = 500;
  let flushInterval = 60 * 1000;
  let queue = [];
  let flushTimer = null;
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
    } else if (queue.length === 1) {
      resetFlushTimeout();
    }
  };

  processor.flush = function (waitForResponse = true) {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
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
      fetcher.post(options.api + '/log_event', secretKey, body, 0);
      return;
    }

    fetcher
      .post(options.api + '/log_event', secretKey, body, 13, 10000)
      .catch((e) => {
        logStatsigInternal(
          null,
          'log_event_failed',
          { error: e?.message || 'log_event_failed' },
          this
        );
      });
  };

  function resetFlushTimeout() {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
    }

    flushTimer = setTimeout(function () {
      processor.flush();
    }, flushInterval);
  }

  return processor;
}

module.exports = LogEventProcessor;

const fetch = require('node-fetch');
const { getStatsigMetadata } = require('./utils/core');
const LogEvent = require('./LogEvent');
const { logStatsigInternal } = require('./utils/logging');

function LogEventProcessor(options, secretKey) {
  const processor = {};
  let flushBatchSize = 1000;
  let flushInterval = 60 * 1000;
  let maxEventQueueSize = 20000;
  let queue = [];
  let flushTimer = null;

  processor.setFlushInterval = function (interval) {
    flushInterval = interval;
  };

  processor.setFlushBatchSize = function (size) {
    flushBatchSize = size;
    if (queue.length > flushBatchSize) {
      this.flush();
    }
  };

  processor.setMaxEventQueueSize = function (size) {
    maxEventQueueSize = size;
  };

  processor.log = function (event) {
    if (!(event instanceof LogEvent)) {
      return;
    }

    if (!event.validate()) {
      return;
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
      fetch(options.api + '/log_event', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-type': 'application/json; charset=UTF-8',
          'STATSIG-API-KEY': secretKey,
        },
      });
      return;
    }

    fetch(options.api + '/log_event', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-type': 'application/json; charset=UTF-8',
        'STATSIG-API-KEY': secretKey,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
      })
      .catch((e) => {
        queue = oldQueue.concat(queue);
        if (queue.length >= flushBatchSize) {
          flushBatchSize = Math.min(
            queue.length + flushBatchSize,
            maxEventQueueSize
          );
        }
        if (queue.length > maxEventQueueSize) {
          // Drop oldest events so that the queue has 10 less than the max amount of events we allow
          queue = queue.slice(queue.length - maxEventQueueSize + 10);
        }
        logStatsigInternal(
          null,
          'log_event_failed',
          { error: e.message },
          this
        );
      });

    queue = [];
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

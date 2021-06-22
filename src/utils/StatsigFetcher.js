const fetch = require('node-fetch');
const Dispatcher = require('./Dispatcher');

const retryStatusCodes = [408, 500, 502, 503, 504, 522, 524, 599];
const fetcher = {
  init: function () {
    if (fetcher.leakyBucket == null) {
      fetcher.leakyBucket = {};
      fetcher.pendingTimers = [];
    }
    if (fetcher.dispatcher == null) {
      fetcher.dispatcher = new Dispatcher(200);
    }
  },

  dispatch: function (url, sdkKey, body, timeout) {
    this.init();
    return fetcher.dispatcher.enqueue(this.post(url, sdkKey, body), timeout);
  },

  post: function (url, sdkKey, body, retries = 0, backoff = 1000) {
    this.init();
    const counter = fetcher.leakyBucket[url];
    if (counter != null && counter >= 1000) {
      return Promise.reject(
        new Error(
          'Request failed because you are making the same request too frequently.',
        ),
      );
    }
    if (counter == null) {
      fetcher.leakyBucket[url] = 1;
    } else {
      fetcher.leakyBucket[url] = counter + 1;
    }
    const params = {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-type': 'application/json; charset=UTF-8',
        'STATSIG-API-KEY': sdkKey,
        'STATSIG-CLIENT-TIME': Date.now(),
      },
    };
    return fetch(url, params)
      .then((res) => {
        if (!res.ok) {
          if (retries > 0 && retryStatusCodes.includes[res.status]) {
            return new Promise((resolve, reject) => {
              fetcher.pendingTimers.push(
                setTimeout(() => {
                  fetcher.leakyBucket[url] = Math.max(
                    fetcher.leakyBucket[url] - 1,
                    0,
                  );
                  this.post(url, sdkKey, body, retries - 1, backoff * 2)
                    .then(resolve)
                    .catch(reject);
                }, backoff),
              );
            });
          } else {
            return Promise.reject(
              new Error(
                'Request to ' + url + ' failed with status ' + res.status,
              ),
            );
          }
        }
        return Promise.resolve(res);
      })
      .finally(() => {
        fetcher.leakyBucket[url] = Math.max(fetcher.leakyBucket[url] - 1, 0);
      });
  },

  shutdown: function () {
    if (fetcher.pendingTimers != null) {
      fetcher.pendingTimers.forEach((timer) => {
        if (timer != null) {
          clearTimeout(timer);
        }
      });
    }
    if (fetcher.dispatcher != null) {
      fetcher.dispatcher._shutdown();
    }
  },
};

module.exports = fetcher;

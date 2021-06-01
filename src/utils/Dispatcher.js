class Dispatcher {
  queue;
  drainInterval;
  drainTimer;

  constructor(drainIntervalms = 200) {
    this.queue = [];
    this.drainInterval = drainIntervalms;
    this.drainTimer = this._scheduleDrain();
  }

  enqueue(promise, timeoutms) {
    let entry = {
      expiry: Date.now() + timeoutms,
      promise: promise,
      taskCompleted: false,
    };

    const dispatcherPromise = new Promise((res, rej) => {
      entry.resolver = res;
      entry.rejecter = rej;
    });

    this.queue.push(entry);

    const markCompleted = ((e) => {
      e.taskCompleted = true;
    }).bind(this);

    promise.then(
      (result) => {
        markCompleted(entry);
        entry.resolver(result);
        return result;
      },
      (err) => {
        markCompleted(entry);
        entry.rejecter(err);
        return err;
      },
    );

    return dispatcherPromise;
  }

  _scheduleDrain() {
    return setTimeout(this._drainQueue.bind(this), this.drainInterval);
  }

  _drainQueue() {
    let oldQueue = this.queue;
    this.queue = [];
    const now = Date.now();
    oldQueue.forEach((entry) => {
      if (!entry.taskCompleted) {
        if (entry.expiry > now) {
          this.queue.push(entry);
        } else {
          entry.rejecter('time_out');
        }
      }
    }, this);

    this.drainTimer = this._scheduleDrain();
  }

  _shutdown() {
    if (this.drainTimer != null) {
      clearTimeout(this.drainTimer);
    }
  }
}

module.exports = Dispatcher;


type Entry = {
  expiry: number;
  promise: Promise<unknown>;
  taskCompleted: boolean;
  resolver?: ((value: unknown) => void) | null;
  rejector?: ((error?: unknown) => void) | null;
};

export default class Dispatcher {
  private queue: Entry[];
  private drainInterval: number;
  private drainTimer: NodeJS.Timer;

  constructor(drainIntervalms = 200) {
    this.queue = [];
    this.drainInterval = drainIntervalms;
    this.drainTimer = this._scheduleDrain();
  }

  public enqueue<T>(promise: Promise<unknown>, timeoutms: number): Promise<T> {
    let entry: Entry = {
      expiry: Date.now() + timeoutms,
      promise: promise,
      taskCompleted: false,
      resolver: null,
      rejector: null
    };

    const dispatcherPromise = new Promise<T>((res, rej) => {
      entry.resolver = res;
      entry.rejector = rej;
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
        entry.rejector(err);
        return err;
      },
    );

    return dispatcherPromise;
  }

  private _scheduleDrain(): NodeJS.Timer {
    return setTimeout(this._drainQueue.bind(this), this.drainInterval);
  }

  private _drainQueue() {
    let oldQueue = this.queue;
    this.queue = [];
    const now = Date.now();
    oldQueue.forEach((entry) => {
      if (!entry.taskCompleted) {
        if (entry.expiry > now) {
          this.queue.push(entry);
        } else {
          entry.rejector('time_out');
        }
      }
    }, this);

    this.drainTimer = this._scheduleDrain();
  }

  public shutdown() {
    if (this.drainTimer != null) {
      clearTimeout(this.drainTimer);
    }
  }
}

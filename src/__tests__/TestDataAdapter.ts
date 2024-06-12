import {
  AdapterResponse,
  DataAdapterKey,
  IDataAdapter,
} from '../interfaces/IDataAdapter';

export default class TestDataAdapter implements IDataAdapter {
  private store: Record<string, string> = {};

  get(key: string): Promise<AdapterResponse> {
    return Promise.resolve({ result: this.store[key], time: Date.now() });
  }
  set(key: string, value: string, time?: number | undefined): Promise<void> {
    this.store[key] = value;
    return Promise.resolve();
  }
  initialize(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    this.store = {};
    return Promise.resolve();
  }
}

export class TestSyncingDataAdapter extends TestDataAdapter {
  private keysToSync: DataAdapterKey[] | undefined;

  constructor(keysToSync?: DataAdapterKey[]) {
    super();
    this.keysToSync = keysToSync;
  }

  supportsPollingUpdatesFor(key): boolean {
    if (!this.keysToSync) {
      return false;
    }
    return this.keysToSync.includes(key);
  }
}

export class TestObjectDataAdapter {
  public store: Record<string, object | string> = {};

  get(key: string): Promise<AdapterResponse> {
    return Promise.resolve({ result: this.store[key], time: Date.now() });
  }
  set(key: string, value: string, time?: number | undefined): Promise<void> {
    if (key === DataAdapterKey.Rulesets || key === DataAdapterKey.IDLists) {
      this.store[key] = JSON.parse(value);
    } else {
      this.store[key] = value;
    }
    return Promise.resolve();
  }
  initialize(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    this.store = {};
    return Promise.resolve();
  }
}

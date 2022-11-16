import { AdapterResponse, IDataAdapter } from '../interfaces/IDataAdapter';

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
  shouldPollForUpdates(_key): boolean {
    return true;
  }
}

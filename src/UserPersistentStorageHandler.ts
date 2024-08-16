import type ConfigEvaluation from './ConfigEvaluation';
import {
  IUserPersistentStorage,
  UserPersistedValues,
} from './interfaces/IUserPersistentStorage';
import OutputLogger from './OutputLogger';
import type { StatsigUser } from './StatsigUser';
import { getUnitID } from './utils/EvaluatorUtils';

export default class UserPersistentStorageHandler {
  constructor(private storage: IUserPersistentStorage | null) {}

  public load(user: StatsigUser, idType: string): UserPersistedValues | null {
    if (this.storage == null) {
      return null;
    }

    const key = UserPersistentStorageHandler.getStorageKey(user, idType);
    if (!key) {
      return null;
    }

    try {
      return this.storage.load(key);
    } catch (e) {
      OutputLogger.error(
        `statsigSDK> Failed to load persisted values for key ${key} (${(e as Error).message})`,
      );
      return null;
    }
  }

  public save(
    user: StatsigUser,
    idType: string,
    configName: string,
    evaluation: ConfigEvaluation,
  ): void {
    if (this.storage == null) {
      return;
    }

    const key = UserPersistentStorageHandler.getStorageKey(user, idType);
    if (!key) {
      return;
    }

    try {
      this.storage.save(key, configName, evaluation.toStickyValues());
    } catch (e) {
      OutputLogger.error(
        `statsigSDK> Failed to save persisted values for key ${key} (${(e as Error).message})`,
      );
    }
  }

  public delete(user: StatsigUser, idType: string, configName: string): void {
    if (this.storage == null) {
      return;
    }

    const key = UserPersistentStorageHandler.getStorageKey(user, idType);
    if (!key) {
      return;
    }

    try {
      this.storage.delete(key, configName);
    } catch (e) {
      OutputLogger.error(
        `statsigSDK> Failed to delete persisted values for key ${key} (${(e as Error).message})`,
      );
    }
  }

  private static getStorageKey(
    user: StatsigUser,
    idType: string,
  ): string | null {
    const unitID = getUnitID(user, idType);
    if (!unitID) {
      OutputLogger.warn(`statsigSDK> No unit ID found for ID type ${idType}`);
    }
    return `${unitID ?? ''}:${idType}`;
  }
}

import { SecondaryExposure } from '../LogEvent';

// The properties of this struct must fit a universal schema that
// when JSON-ified, can be parsed by every SDK supporting user persistent evaluation.
export type StickyValues = {
  value: boolean;
  json_value: Record<string, unknown>;
  rule_id: string;
  group_name: string | null;
  secondary_exposures: SecondaryExposure[];
  undelegated_secondary_exposures: SecondaryExposure[];
  config_delegate: string | null;
  explicit_parameters: string[] | null;
  time: number;
  configVersion?: number | undefined;
};

export type UserPersistedValues = Record<string, StickyValues>;

/**
 * A storage adapter for persisted values. Can be used for sticky bucketing users in experiments.
 */
export interface IUserPersistentStorage {
  /**
   * Returns the full map of persisted values for a specific user key
   * @param key user key
   */
  load(key: string): UserPersistedValues;

  /**
   * Save the persisted values of a config given a specific user key
   * @param key user key
   * @param configName Name of the config/experiment
   * @param data Object representing the persistent assignment to store for the given user-config
   */
  save(key: string, configName: string, data: StickyValues): void;

  /**
   * Delete the persisted values of a config given a specific user key
   * @param key user key
   * @param configName Name of the config/experiment
   */
  delete(key: string, configName: string): void;
}

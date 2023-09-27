import { StatsigEnvironment } from './StatsigOptions';
import { djb2HashForObject } from './utils/Hashing';

/**
 * An object of properties relating to the current user
 * Provide as many as possible to take advantage of advanced conditions in the statsig console
 * A dictionary of additional fields can be provided under the "custom" field
 */
export type StatsigUser =
  // at least one of userID or customIDs must be provided
  ({ userID: string } | { customIDs: Record<string, string> }) & {
    userID?: string;
    customIDs?: Record<string, string>;
    email?: string;
    ip?: string;
    userAgent?: string;
    country?: string;
    locale?: string;
    appVersion?: string;
    custom?: Record<
      string,
      string | number | boolean | Array<string> | undefined
    >;
    privateAttributes?: Record<
      string,
      string | number | boolean | Array<string> | undefined
    > | null;
    statsigEnvironment?: StatsigEnvironment;
  };

export function getUserHashWithoutStableID(user: StatsigUser): string {
  const { customIDs, ...rest } = user;
  const copyCustomIDs = { ...customIDs };
  delete copyCustomIDs.stableID;
  return djb2HashForObject({ ...rest, customIDs: copyCustomIDs });
}

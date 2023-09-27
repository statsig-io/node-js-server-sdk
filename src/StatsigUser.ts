import { StatsigEnvironment } from './StatsigOptions';

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

export function fasthash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const character = value.charCodeAt(i);
    hash = (hash << 5) - hash + character;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

export function djb2Hash(value: string): string {
  return String(fasthash(value) >>> 0);
}

export function djb2HashForObject(
  object: Record<string, unknown> | null,
): string {
  return djb2Hash(JSON.stringify(getSortedObject(object)));
}

export function getSortedObject(
  object: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (object == null) {
    return null;
  }
  const keys = Object.keys(object).sort();
  const sortedObject: Record<string, unknown> = {};
  keys.forEach((key) => {
    let value = object[key];
    if (value instanceof Object) {
      value = getSortedObject(value as Record<string, unknown>);
    }

    sortedObject[key] = value;
  });
  return sortedObject;
}

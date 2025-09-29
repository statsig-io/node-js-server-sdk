import { StatsigUser } from '../StatsigUser';
import { sha256Hash } from './Hashing';
import parseUserAgent from './parseUserAgent';

export function getUnitID(user: StatsigUser, idType: string) {
  if (typeof idType === 'string' && idType.toLowerCase() !== 'userid') {
    const unitID = user?.customIDs?.[idType];
    if (unitID !== undefined) {
      return unitID;
    }
    return getParameterCaseInsensitive(user?.customIDs, idType);
  }
  return user?.userID;
}

const hashLookupTable: Map<string, bigint> = new Map();

export function computeUserHash(userHash: string) {
  const existingHash = hashLookupTable.get(userHash);
  if (existingHash) {
    return existingHash;
  }

  const hash = sha256Hash(userHash).getBigUint64(0, false);

  if (hashLookupTable.size > 100000) {
    hashLookupTable.clear();
  }

  hashLookupTable.set(userHash, hash);
  return hash;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFromUser(
  user: StatsigUser,
  field: string | null,
): any | null {
  if (typeof user !== 'object' || field == null) {
    return null;
  }
  const indexableUser = user as { [field: string]: unknown };

  return (
    indexableUser[field] ??
    indexableUser[field.toLowerCase()] ??
    user?.custom?.[field] ??
    user?.custom?.[field.toLowerCase()] ??
    user?.privateAttributes?.[field] ??
    user?.privateAttributes?.[field.toLowerCase()]
  );
}

export function getFromUserAgent(user: StatsigUser, field: string | null) {
  if (field == null) {
    return null;
  }

  const ua = getFromUser(user, 'userAgent');
  if (ua == null) {
    return null;
  }

  if (typeof ua !== 'string' || ua.length > 1000) {
    return null;
  }
  const res = parseUserAgent(ua);
  switch (field.toLowerCase()) {
    case 'os_name':
    case 'osname':
      return res.os.name ?? null;
    case 'os_version':
    case 'osversion':
      return res.os.version ?? null;
    case 'browser_name':
    case 'browsername':
      return res.browser.name ?? null;
    case 'browser_version':
    case 'browserversion':
      return res.browser.version ?? null;
    default:
      return null;
  }
}

export function getFromEnvironment(user: StatsigUser, field: string | null) {
  if (field == null) {
    return null;
  }
  return getParameterCaseInsensitive(user?.statsigEnvironment, field);
}

export function getParameterCaseInsensitive<T>(
  object: Record<string, T> | undefined | null,
  key: string,
): T | undefined {
  if (object == null) {
    return undefined;
  }
  const asLowercase = key.toLowerCase();
  const keyMatch = Object.keys(object).find(
    (k) => k.toLowerCase() === asLowercase,
  );
  if (keyMatch === undefined) {
    return undefined;
  }
  return object[keyMatch];
}

export function numberCompare(
  fn: (a: number, b: number) => boolean,
): (a: unknown, b: unknown) => boolean {
  return (a: unknown, b: unknown) => {
    if (a == null || b == null) {
      return false;
    }
    const numA = Number(a);
    const numB = Number(b);
    if (isNaN(numA) || isNaN(numB)) {
      return false;
    }
    return fn(numA, numB);
  };
}

export function versionCompareHelper(
  fn: (res: number) => boolean,
): (a: string, b: string) => boolean {
  return (a: string, b: string) => {
    const comparison = versionCompare(a, b);
    if (comparison == null) {
      return false;
    }
    return fn(comparison);
  };
}

// Compare two version strings without the extensions.
// returns -1, 0, or 1 if first is smaller than, equal to, or larger than second.
// returns false if any of the version strings is not valid.
export function versionCompare(first: string, second: string): number | null {
  if (typeof first !== 'string' || typeof second !== 'string') {
    return null;
  }
  const version1 = removeVersionExtension(first);
  const version2 = removeVersionExtension(second);
  if (version1.length === 0 || version2.length === 0) {
    return null;
  }

  const parts1 = version1.split('.');
  const parts2 = version2.split('.');
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    if (parts1[i] === undefined) {
      parts1[i] = '0';
    }
    if (parts2[i] === undefined) {
      parts2[i] = '0';
    }
    const n1 = Number(parts1[i]);
    const n2 = Number(parts2[i]);
    if (
      typeof n1 !== 'number' ||
      typeof n2 !== 'number' ||
      isNaN(n1) ||
      isNaN(n2)
    ) {
      return null;
    }
    if (n1 < n2) {
      return -1;
    } else if (n1 > n2) {
      return 1;
    }
  }
  return 0;
}

export function removeVersionExtension(version: string): string {
  const hyphenIndex = version.indexOf('-');
  if (hyphenIndex >= 0) {
    return version.substr(0, hyphenIndex);
  }
  return version;
}

export function stringCompare(
  ignoreCase: boolean,
  fn: (a: string, b: string) => boolean,
): (a: string, b: string) => boolean {
  return (a: string, b: string): boolean => {
    if (a == null || b == null) {
      return false;
    }
    return ignoreCase
      ? fn(String(a).toLowerCase(), String(b).toLowerCase())
      : fn(String(a), String(b));
  };
}

export function dateCompare(
  fn: (a: Date, b: Date) => boolean,
): (a: string | number, b: string | number) => boolean {
  return (a: string | number, b: string | number): boolean => {
    if (a == null || b == null) {
      return false;
    }
    try {
      // Try to parse into date as a string first, if not, try unixtime
      let dateA = new Date(a);
      if (typeof a == 'string') {
        if (isNaN(dateA.getTime())) {
          dateA = new Date(getTimeInMs(a));
        }
      } else {
        dateA = new Date(getTimeInMs(a));
      }

      let dateB = new Date(b);
      if (typeof b == 'string') {
        if (isNaN(dateB.getTime())) {
          dateB = new Date(getTimeInMs(b));
        }
      } else {
        dateB = new Date(getTimeInMs(b));
      }

      return (
        !isNaN(dateA.getTime()) && !isNaN(dateB.getTime()) && fn(dateA, dateB)
      );
    } catch (e) {
      // malformatted input, returning false
      return false;
    }
  };
}

function getTimeInMs(time: string | number): number {
  let numericalVal = Number(time);
  if (isNaN(numericalVal)) {
    return Number.NaN;
  }
  if (numericalVal < 10_000_000_000) {
    // Timestamp in seconds format, we convert it to be ms
    numericalVal *= 1000;
  }
  return numericalVal;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function arrayAny(
  value: any,
  array: unknown,
  fn: (value: any, otherValue: any) => boolean,
): boolean {
  if (!Array.isArray(array)) {
    return false;
  }
  for (let i = 0; i < array.length; i++) {
    if (fn(value, array[i])) {
      return true;
    }
  }
  return false;
}

export function arrayHasValue(
  value: unknown[],
  target: string[] | number[],
): boolean {
  const valueSet = new Set(value);
  for (let i = 0; i < target.length; i++) {
    if (
      valueSet.has(target[i]) ||
      valueSet.has(parseInt(target[i] as string))
    ) {
      return true;
    }
  }
  return false;
}

export function arrayHasAllValues(
  value: unknown[],
  target: string[] | number[],
): boolean {
  const valueSet = new Set(value);
  for (let i = 0; i < target.length; i++) {
    if (
      !valueSet.has(target[i]) &&
      !valueSet.has(parseInt(target[i] as string))
    ) {
      return false;
    }
  }
  return true;
}

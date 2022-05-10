import uuidv4 from 'uuid';
import { StatsigUser } from '../StatsigUser';

function getSDKVersion(): string {
  try {
    return require('../../package.json')?.version ?? '';
  } catch (err) {
    return '';
  }
}

function getSDKType(): string {
  try {
    return require('../../package.json')?.name ?? 'statsig-node';
  } catch (err) {
    return 'statsig-node';
  }
}

function generateID(): string {
  return uuidv4();
}

function clone(obj: Record<string, unknown> | null): Record<string, unknown> | null {
  if (obj == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(obj));
}

// Return a number if num can be parsed to a number, otherwise return null
function getNumericValue(num): number | null {
  if (num == null) {
    return null;
  }
  const n = Number(num);
  if (typeof n === 'number' && !isNaN(n) && isFinite(n) && num != null) {
    return n;
  }
  return null;
}

// Return the boolean value of the input if it can be casted into a boolean, null otherwise
function getBoolValue(val): boolean | null {
  if (val == null) {
    return null;
  } else if (val.toString().toLowerCase() === 'true') {
    return true;
  } else if (val.toString().toLowerCase() === 'false') {
    return false;
  }
  return null;
}

export type StatsigMetadata = {
  sdkType: string,
  sdkVersion: string,
}

function getStatsigMetadata(): StatsigMetadata {
  return {
    sdkType: getSDKType(),
    sdkVersion: getSDKVersion(),
  };
}

function isUserIdentifiable(user: StatsigUser | null): boolean {
  if (user == null) return false;
  if (typeof user !== 'object') return false;
  const userID = user.userID;
  const customIDs = user.customIDs;
  return (
    typeof userID === 'number' ||
    typeof userID === 'string' ||
    (customIDs != null &&
      typeof customIDs === 'object' &&
      Object.keys(customIDs).length !== 0)
  );
}

export {
  clone,
  generateID,
  getBoolValue,
  getNumericValue,
  getSDKVersion,
  getSDKType,
  getStatsigMetadata,
  isUserIdentifiable,
};

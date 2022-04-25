const uuidv4 = require('uuid');

function getSDKVersion() {
  try {
    return require('../../package.json')?.version ?? '';
  } catch (err) {
    return '';
  }
}

function getSDKType() {
  try {
    return require('../../package.json')?.name ?? 'statsig-node';
  } catch (err) {
    return 'statsig-node';
  }
}

function generateID() {
  return uuidv4();
}

function clone(obj) {
  if (obj == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(obj));
}

// Return a number if num can be parsed to a number, otherwise return null
function getNumericValue(num) {
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
function getBoolValue(val) {
  if (val == null) {
    return null;
  } else if (val.toString().toLowerCase() === 'true') {
    return true;
  } else if (val.toString().toLowerCase() === 'false') {
    return false;
  }
  return null;
}

function getStatsigMetadata() {
  return {
    sdkType: getSDKType(),
    sdkVersion: getSDKVersion(),
  };
}

function isUserIdentifiable(user) {
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

module.exports = {
  clone,
  generateID,
  getBoolValue,
  getNumericValue,
  getSDKVersion,
  getSDKType,
  getStatsigMetadata,
  isUserIdentifiable,
};

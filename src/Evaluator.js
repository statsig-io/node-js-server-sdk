const crypto = require('crypto');
const { DynamicConfig } = require('./DynamicConfig');
const ip3country = require('ip3country');
const {
  ConfigSpec,
  ConfigRule,
  ConfigCondition,
  FETCH_FROM_SERVER,
} = require('./ConfigSpec');
const semver = require('semver');
const SpecStore = require('./SpecStore');
const UAParser = require('ua-parser-js');

const TYPE_DYNAMIC_CONFIG = 'dynamic_config';

const Evaluator = {
  async init(options, secretKey) {
    await SpecStore.init(options, secretKey);
    await ip3country.init();
    this.initialized = true;
  },

  // returns a object with 'value' and 'rule_id' properties, or null if used incorrectly (e.g. gate name does not exist or not initialized)
  // or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
  checkGate(user, gateName) {
    if (!this.initialized || !(gateName in SpecStore.store.gates)) {
      return null;
    }
    return this._eval(user, SpecStore.store.gates[gateName]);
  },

  // returns a DynamicConfig object, or null if used incorrectly (e.g. config name does not exist or not initialized)
  // or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
  getConfig(user, configName) {
    if (!this.initialized || !(configName in SpecStore.store.configs)) {
      return null;
    }
    return this._eval(user, SpecStore.store.configs[configName]);
  },

  shutdown() {
    SpecStore.shutdown();
  },

  /**
   * Evaluates the current config spec, returns a boolean if the user pass or fail the rule,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the rule cannot be evaluated by the SDK.
   * @param {object} user
   * @param {ConfigSpec} config
   * @returns {DynamicConfig | object}
   */
  _eval(user, config) {
    if (config.enabled) {
      for (let i = 0; i < config.rules.length; i++) {
        let rule = config.rules[i];
        const result = this._evalRule(user, rule);
        if (result === FETCH_FROM_SERVER) {
          return FETCH_FROM_SERVER;
        }
        if (result === true) {
          const pass = this._evalPassPercent(user, rule, config.salt);
          return config.type.toLowerCase() === TYPE_DYNAMIC_CONFIG
            ? new DynamicConfig(
                config.name,
                pass ? rule.returnValue : config.defaultValue,
                rule.id,
              )
            : { value: pass, rule_id: rule.id };
        }
      }
    }
    return config.type.toLowerCase() === TYPE_DYNAMIC_CONFIG
      ? new DynamicConfig(config.name, config.defaultValue, 'default')
      : { value: false, rule_id: 'default' };
  },

  _evalPassPercent(user, rule, salt) {
    const hash = crypto
      .createHash('sha256')
      .update(salt + '.' + rule.name + '.' + user?.userID ?? '')
      .digest()
      .readBigUInt64BE();
    return Number(hash % BigInt(10000)) < rule.passPercentage * 100;
  },

  /**
   * Evaluates the current rule, returns a boolean if the user pass or fail the rule,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the rule cannot be evaluated by the SDK.
   * @param {object} user
   * @param {ConfigRule} rule
   * @returns {string | boolean}
   */
  _evalRule(user, rule) {
    for (let i = 0; i < rule.conditions.length; i++) {
      const result = this._evalCondition(user, rule.conditions[i]);
      if (result !== true) {
        return result;
      }
    }
    return true;
  },

  /**
   * Evaluates the current condition, returns a boolean if the user pass or fail the condition,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the condition cannot be evaluated by the SDK.
   * @param {*} user
   * @param {ConfigCondition} condition
   * @returns {string | boolean}
   */
  _evalCondition(user, condition) {
    let value = null;
    let field = condition.field;
    let target = condition.targetValue;
    switch (condition.type.toLowerCase()) {
      case 'public':
        return true;
      case 'fail_gate':
      case 'pass_gate':
        const gateResult = Evaluator.checkGate(user, target);
        if (gateResult === FETCH_FROM_SERVER) {
          return FETCH_FROM_SERVER;
        }
        value = gateResult?.value;
        return condition.type.toLowerCase() === 'fail_gate' ? !value : value;
      case 'ip_based':
        // this would apply to things like 'country', 'region', etc.
        value = getFromUser(user, field) ?? getFromIP(user, field);
        if (value === FETCH_FROM_SERVER) {
          return FETCH_FROM_SERVER;
        }
        break;
      case 'ua_based':
        // this would apply to things like 'os', 'browser', etc.
        value = getFromUser(user, field) ?? getFromUserAgent(user, field);
        break;
      case 'user_field':
        value = getFromUser(user, field);
        break;
      case 'environment_field':
        value = getFromEnvironment(user, field);
        break;
      case 'current_time':
        value = Date.now();
        break;
      default:
        return FETCH_FROM_SERVER;
    }

    if (value == null) {
      return false;
    }
    if (value === FETCH_FROM_SERVER) {
      return FETCH_FROM_SERVER;
    }

    switch (condition.operator?.toLowerCase()) {
      // numerical
      case 'gt':
        return numberCompare((a, b) => a > b)(value, target);
      case 'gte':
        return numberCompare((a, b) => a >= b)(value, target);
      case 'lt':
        return numberCompare((a, b) => a < b)(value, target);
      case 'lte':
        return numberCompare((a, b) => a <= b)(value, target);

      // version
      case 'version_gt':
        return versionCompare((a, b) => semver.gt(a, b))(value, target);
      case 'version_gte':
        return versionCompare((a, b) => semver.gte(a, b))(value, target);
      case 'version_lt':
        return versionCompare((a, b) => semver.lt(a, b))(value, target);
      case 'version_lte':
        return versionCompare((a, b) => semver.lte(a, b))(value, target);
      case 'version_eq':
        return versionCompare((a, b) => semver.eq(a, b))(value, target);
      case 'version_neq':
        return versionCompare((a, b) => semver.neq(a, b))(value, target);

      // array
      case 'any':
        return arrayContains(target, value);
      case 'none':
        return !arrayContains(target, value);

      // string
      case 'str_starts_with_any':
        if (Array.isArray(target)) {
          for (let i = 0; i < target.length; i++) {
            if (stringCompare((a, b) => a.startsWith(b))(value, target[i])) {
              return true;
            }
          }
          return false;
        } else {
          return stringCompare((a, b) => a.startsWith(b))(value, target);
        }
      case 'str_ends_with_any':
        if (Array.isArray(target)) {
          for (let i = 0; i < target.length; i++) {
            if (stringCompare((a, b) => a.endsWith(b))(value, target[i])) {
              return true;
            }
          }
          return false;
        } else {
          return stringCompare((a, b) => a.endsWith(b))(value, target);
        }
      case 'str_contains_any':
        if (Array.isArray(target)) {
          for (let i = 0; i < target.length; i++) {
            if (stringCompare((a, b) => a.includes(b))(value, target[i])) {
              return true;
            }
          }
          return false;
        } else {
          return stringCompare((a, b) => a.includes(b))(value, target);
        }
      case 'str_matches':
        try {
          return new RegExp(target).test(value);
        } catch (e) {
          return false;
        }
      // strictly equals
      case 'eq':
        return value === target;
      case 'neq':
        return value !== target;

      // dates
      case 'before':
        return dateCompare((a, b) => a < b)(value, target);
      case 'after':
        return dateCompare((a, b) => a > b)(value, target);
      case 'on':
        return dateCompare((a, b) => {
          a?.setHours(0, 0, 0, 0);
          b?.setHours(0, 0, 0, 0);
          return a?.getTime() === b?.getTime();
        })(value, target);
      default:
        return FETCH_FROM_SERVER;
    }
  },

  ip2country(ip) {
    if (!this.initialized) {
      return null;
    }
    try {
      if (typeof ip === 'string') {
        return ip3country.lookupStr(ip);
      } else if (typeof ip === 'number') {
        return ip3country.lookupNumeric(ip);
      }
    } catch (e) {
      // TODO: log
    }
    return null;
  },
};

function getFromUser(user, field) {
  if (typeof user !== 'object') {
    return null;
  }
  return (
    user?.[field] ??
    user?.[field.toLowerCase()] ??
    user?.custom?.[field] ??
    user?.custom?.[field.toLowerCase]
  );
}

function getFromIP(user, field) {
  const ip = user?.ip ?? user?.custom?.ip;
  if (ip == null) {
    return null;
  }
  if (field.toLowerCase() === 'country') {
    return Evaluator.ip2country(ip);
  }
  return FETCH_FROM_SERVER;
}

function getFromUserAgent(user, field) {
  let ua = user?.userAgent ?? user?.custom?.userAgent;
  if (ua == null) {
    return null;
  }
  const res = new UAParser(ua);
  let val = {
    os_name: res.getOS().name ?? null,
    os_version: res.getOS().version ?? null,
    browser_name: res.getBrowser().name ?? null,
    browser_version: res.getBrowser().version ?? null,
  };

  return val[field.toLowerCase()];
}

function getFromEnvironment(user, field) {
  return (
    user?.statsigEnvironment?.[field] ??
    user?.statsigEnvironment?.[field.toLowerCase()]
  );
}

function numberCompare(fn) {
  return (a, b) => {
    return typeof a === 'number' && typeof b === 'number' && fn(a, b);
  };
}

function versionCompare(fn) {
  return (a, b) => {
    const version1 = semver.coerce(a);
    const version2 = semver.coerce(b);
    return version1 !== null && version2 !== null && fn(version1, version2);
  };
}

function stringCompare(fn) {
  return (a, b) => {
    return (
      typeof a === 'string' &&
      typeof b === 'string' &&
      fn(a.toLowerCase(), b.toLowerCase())
    );
  };
}

function dateCompare(fn) {
  return (a, b) => {
    try {
      // Try to parse into date as a string first, if not, try unixtime
      let dateA = new Date(a);
      if (isNaN(dateA.getTime())) {
        dateA = new Date(Number(a));
      }

      let dateB = new Date(b);
      if (isNaN(dateB.getTime())) {
        dateB = new Date(Number(b));
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

function arrayContains(array, value) {
  if (!Array.isArray(array)) {
    return false;
  }
  for (let i = 0; i < array.length; i++) {
    if (
      typeof array[i] === 'string' &&
      typeof value === 'string' &&
      array[i].toLowerCase() === value.toLowerCase()
    ) {
      return true;
    }
    if (array[i] === value) {
      return true;
    }
  }
  return false;
}

module.exports = Evaluator;

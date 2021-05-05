const crypto = require('crypto');
const { DynamicConfig } = require('./DynamicConfig');
const UAParser = require('ua-parser-js');
const semver = require('semver');
const specStore = require('./specStore');

export const FETCH_FROM_SERVER = 'FETCH_FROM_SERVER';

const TYPE_DYNAMIC_CONFIG = 'dynamic_config';

export class ConfigSpec {
  constructor(specJSON) {
    this.name = specJSON.name;
    this.type = specJSON.type;
    this.salt = specJSON.salt;
    this.defaultValue = specJSON.defaultValue;
    this.enabled = specJSON.enabled;
    this.rules = this.parseRules(specJSON.rules, this.salt);
  }

  parseRules(rulesJSON, salt) {
    var rules = [];
    for (let ruleJSON in rulesJSON) {
      let rule = new ConfigRule(ruleJSON, salt);
      rules.push(rule);
    }
    return rules;
  }

  evaluate(user) {
    this.rules.forEach((rule) => {
      if (rule.evaluate(user) === FETCH_FROM_SERVER) {
        return FETCH_FROM_SERVER;
      }
      if (rule.evaluate(user) === true) {
        return this.type.toLowerCase() === TYPE_DYNAMIC_CONFIG
          ? new DynamicConfig(this.name, rule.returnValue, rule.name)
          : true;
      }
    });
    return this.type.toLowerCase() === TYPE_DYNAMIC_CONFIG
      ? new DynamicConfig(this.name, this.defaultValue, 'default')
      : false;
  }
}

class ConfigRule {
  constructor(ruleJSON, salt) {
    this.name = ruleJSON.name;
    this.passPercentage = ruleJSON.passPercentage;
    this.conditions = this.parseConditions(ruleJSON.conditions);
    this.returnValue = ruleJSON.returnValue;
    this.salt = salt;
  }

  parseConditions(conditionsJSON) {
    var conditions = [];
    for (let cJSON in conditionsJSON) {
      let condition = new ConfigCondition(cJSON);
      conditions.push(condition);
    }
    return conditions;
  }

  /**
   * Evaluates the current rule, returns a boolean if the user pass or fail the rule,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the rule cannot be evaluated by the SDK.
   * @param {*} user
   * @returns {string | boolean}
   */
  evaluate(user) {
    this.conditions.forEach((condition) => {
      if (condition.evaluate(user) === FETCH_FROM_SERVER) {
        return FETCH_FROM_SERVER;
      }
      if (condition.evaluate(user) === false) {
        return false;
      }
    });

    const hash = crypto
      .createHash('sha256')
      .update(this.salt + '.' + this.name + '.' + user.userID)
      .digest()
      .readBigUInt64BE();
    return Number(hash % BigInt(10000)) < this.passPercentage * 100;
  }
}

class ConfigCondition {
  constructor(conditionJSON) {
    this.type = conditionJSON.type;
    this.targetValue = conditionJSON.value;
    this.operator = conditionJSON.operator;
    this.field = conditionJSON.field;
  }

  /**
   * Evaluates the current condition, returns a boolean if the user pass or fail the condition,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the condition cannot be evaluated by the SDK.
   * @param {*} user
   * @returns {string | boolean}
   */
  evaluate(user) {
    let value = null;
    let field = this.field;
    let target = this.targetValue;
    switch (this.type.toLowerCase()) {
      case 'public':
        value = true;
        break;
      case 'fail_gate':
      case 'pass_gate':
        if (target in specStore) {
          value = specStore[target].evaluate(user);
          if (value === FETCH_FROM_SERVER) {
            return FETCH_FROM_SERVER;
          }
          return this.type.toLowerCase() === 'fail_gate' ? !value : value;
        } else {
          return false;
        }
        break;
      case 'ip_based':
        // this would apply to things like 'country', 'region', etc.
        value = getFromUser(user, field) ?? getFromIP(user, field);
        break;
      case 'ua_based':
        // this would apply to things like 'os', 'browser', etc.
        value = getFromUser(user, field) ?? getFromUserAgent(user, field);
        break;
      case 'user_field':
        value = getFromUser(user, field);
        break;
      default:
        return FETCH_FROM_SERVER;
    }

    if (value == null) {
      return false;
    }

    switch (this.operator.toLowerCase()) {
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
      case 'version_ge':
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
        if (Array.isArray(target)) {
          return target.includes(value);
        }
        return false;
      case 'none':
        if (Array.isArray(target)) {
          return !target.includes(value);
        }
        return false;

      // string
      case 'str_starts_with_any':
        if (Array.isArray(target)) {
          target.forEach((t) => {
            if (stringCompare((a, b) => a.startsWith(b))(value, t)) {
              return true;
            }
          });
          return false;
        } else {
          return stringCompare((a, b) => a.startsWith(b))(value, target);
        }
      case 'str_ends_with_any':
        if (Array.isArray(target)) {
          target.forEach((t) => {
            if (stringCompare((a, b) => a.endsWith(b))(value, t)) {
              return true;
            }
          });
          return false;
        } else {
          return stringCompare((a, b) => a.endsWith(b))(value, target);
        }
      case 'str_contains_any':
        if (Array.isArray(target)) {
          target.forEach((t) => {
            if (stringCompare((a, b) => a.includes(b))(value, t)) {
              return true;
            }
          });
          return false;
        } else {
          return stringCompare((a, b) => a.includes(b))(value, target);
        }
      case 'str_matches':
        return stringCompare((a, b) => {
          try {
            return new RegExp(b).test(a);
          } catch (e) {
            return false;
          }
        })(value, target);

      // strictly equals
      case 'equals':
        return value === target;
      case 'not_equal':
        return value !== target;

      // dates
      case 'before':
      case 'after':
      case 'on':
      default:
        return FETCH_FROM_SERVER;
    }
  }
}

function getFromUser(user, field) {
  if (typeof user !== 'object') {
    return null;
  }
  return user[field] ?? user?.custom[field] ?? null;
}

function getFromIP(user, field) {
  const ip = user?.ip ?? user?.custom?.ip;
  if (ip == null) {
    return null;
  }
  if (field.toLowerCase() === 'country') {
    return specStore.ip2country(ip);
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

function numberCompare(fn) {
  return (a, b) => {
    return typeof a === 'number' && typeof b === 'number' && fn(a, b);
  };
}

function versionCompare(fn) {
  return (a, b) => {
    const version1 = semver.valid(a);
    const version2 = semver.valid(b);
    return version1 !== null && version2 !== null && fn(version1, version2);
  };
}

function stringCompare(fn) {
  return (a, b) => {
    return typeof a === 'string' && typeof b === 'string' && fn(a, b);
  };
}

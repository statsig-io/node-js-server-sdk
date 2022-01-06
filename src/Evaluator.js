const crypto = require('crypto');
const { DynamicConfig } = require('./DynamicConfig');
const ip3country = require('ip3country');
const {
  ConfigSpec,
  ConfigRule,
  ConfigCondition,
  FETCH_FROM_SERVER,
} = require('./ConfigSpec');
const SpecStore = require('./SpecStore');
const UAParser = require('useragent');

const TYPE_DYNAMIC_CONFIG = 'dynamic_config';
const CONDITION_SEGMENT_COUNT = 10 * 1000;
const USER_BUCKET_COUNT = 1000;

const Evaluator = {
  async init(options, secretKey) {
    await SpecStore.init(options, secretKey);
    await ip3country.init();
    this.gateOverrides = {};
    this.configOverrides = {};
    this.initialized = true;
  },

  overrideGate(gateName, value, userID = null) {
    let overrides = this.gateOverrides[gateName];
    if (overrides == null) {
      overrides = {};
    }
    overrides[userID == null ? '' : userID] = value;
    this.gateOverrides[gateName] = overrides;
  },

  overrideConfig(configName, value, userID = '') {
    let overrides = this.configOverrides[configName];
    if (overrides == null) {
      overrides = {};
    }
    overrides[userID == null ? '' : userID] = value;
    this.configOverrides[configName] = overrides;
  },

  lookupGateOverride(user, gateName) {
    const overrides = this.gateOverrides[gateName];
    if (overrides == null) {
      return null;
    }
    if (user.userID != null) {
      // check for a user level override
      const userOverride = overrides[user.userID];
      if (userOverride != null) {
        return {
          value: userOverride,
          rule_id: 'override',
          secondary_exposures: [],
        };
      }
    }

    // check if there is a global override
    const allOverride = overrides[''];
    if (allOverride != null) {
      return {
        value: allOverride,
        rule_id: 'override',
        secondary_exposures: [],
      };
    }
  },

  lookupConfigOverride(user, configName) {
    const overrides = this.configOverrides[configName];
    if (overrides == null) {
      return null;
    }

    if (user.userID != null) {
      // check for a user level override
      const userOverride = overrides[user.userID];
      if (userOverride != null) {
        return new DynamicConfig(configName, userOverride, 'override', []);
      }
    }

    // check if there is a global override
    const allOverride = overrides[''];
    if (allOverride != null) {
      return new DynamicConfig(configName, allOverride, 'override', []);
    }
  },

  // returns a object with 'value' and 'rule_id' properties, or null if used incorrectly (e.g. gate name does not exist or not initialized)
  // or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
  checkGate(user, gateName) {
    if (!this.initialized) {
      return null;
    }
    const override = this.lookupGateOverride(user, gateName);
    if (override != null) {
      return override;
    }
    if (!(gateName in SpecStore.store.gates)) {
      return null;
    }
    return this._eval(user, SpecStore.store.gates[gateName]);
  },

  // returns a DynamicConfig object, or null if used incorrectly (e.g. config name does not exist or not initialized)
  // or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
  getConfig(user, configName) {
    if (!this.initialized) {
      return null;
    }
    const override = this.lookupConfigOverride(user, configName);
    if (override != null) {
      return override;
    }
    if (!(configName in SpecStore.store.configs)) {
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
    let secondary_exposures = [];
    if (config.enabled) {
      for (let i = 0; i < config.rules.length; i++) {
        let rule = config.rules[i];
        const ruleResult = this._evalRule(user, rule);
        if (ruleResult.value === FETCH_FROM_SERVER) {
          return { value: FETCH_FROM_SERVER, secondary_exposures: [] };
        }
        secondary_exposures = secondary_exposures.concat(
          ruleResult.secondary_exposures,
        );
        if (ruleResult.value === true) {
          const pass = this._evalPassPercent(user, rule, config);
          return config.type.toLowerCase() === TYPE_DYNAMIC_CONFIG
            ? new DynamicConfig(
                config.name,
                pass ? rule.returnValue : config.defaultValue,
                rule.id,
                secondary_exposures,
              )
            : {
                value: pass,
                rule_id: rule.id,
                secondary_exposures: secondary_exposures,
              };
        }
      }
    }
    const ruleID = config.enabled ? 'default' : 'disabled';
    return config.type.toLowerCase() === TYPE_DYNAMIC_CONFIG
      ? new DynamicConfig(
          config.name,
          config.defaultValue,
          ruleID,
          secondary_exposures,
        )
      : {
          value: false,
          rule_id: ruleID,
          secondary_exposures: secondary_exposures,
        };
  },

  _evalPassPercent(user, rule, config) {
    const hash = computeUserHash(
      config.salt +
        '.' +
        (rule.salt ?? rule.id) +
        '.' +
        this._getUnitID(user, rule.idType) ?? '',
    );
    return (
      Number(hash % BigInt(CONDITION_SEGMENT_COUNT)) < rule.passPercentage * 100
    );
  },

  _getUnitID(user, idType) {
    if (typeof idType === 'string' && idType.toLowerCase() !== 'userid') {
      return (
        user?.customIDs?.[idType] ?? user?.customIDs?.[idType.toLowerCase()]
      );
    }
    return user?.userID;
  },

  /**
   * Evaluates the current rule, returns a boolean if the user pass or fail the rule,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the rule cannot be evaluated by the SDK.
   * @param {object} user
   * @param {ConfigRule} rule
   * @returns {object}
   */
  _evalRule(user, rule) {
    const conditionResults = rule.conditions.map((condition) =>
      this._evalCondition(user, condition),
    );

    return conditionResults.reduce(
      (finalRes, currentRes) => {
        // If any result says fetch from server, then we fetch from server. This should be super rare.
        // Otherwise, if any result evaluated to false, the whole rule should be false.
        if (currentRes.value === FETCH_FROM_SERVER) {
          finalRes.value = FETCH_FROM_SERVER;
        } else if (!currentRes.value && finalRes.value === true) {
          finalRes.value = false;
        }

        // Adding up all secondary exposures
        if (Array.isArray(currentRes.secondary_exposures)) {
          finalRes.secondary_exposures = finalRes.secondary_exposures.concat(
            currentRes.secondary_exposures,
          );
        }
        return finalRes;
      },
      {
        value: true,
        secondary_exposures: [],
      },
    );
  },

  /**
   * Evaluates the current condition, returns a boolean if the user pass or fail the condition,
   * but can also return a string with value 'FETCH_FROM_SERVER' if the condition cannot be evaluated by the SDK.
   * @param {*} user
   * @param {ConfigCondition} condition
   * @returns {object}
   */
  _evalCondition(user, condition) {
    let value = null;
    let field = condition.field;
    let target = condition.targetValue;
    let idType = condition.idType;
    switch (condition.type.toLowerCase()) {
      case 'public':
        return { value: true, secondary_exposures: [] };
      case 'fail_gate':
      case 'pass_gate':
        const gateResult = Evaluator.checkGate(user, target);
        if (gateResult === FETCH_FROM_SERVER) {
          return { value: FETCH_FROM_SERVER, secondary_exposures: [] };
        }
        value = gateResult?.value;

        let allExposures = gateResult?.secondary_exposures ?? [];
        allExposures.push({
          gate: target,
          gateValue: String(value),
          ruleID: gateResult?.rule_id ?? '',
        });

        return {
          value: condition.type.toLowerCase() === 'fail_gate' ? !value : value,
          secondary_exposures: allExposures,
        };
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
      case 'environment_field':
        value = getFromEnvironment(user, field);
        break;
      case 'current_time':
        value = Date.now();
        break;
      case 'user_bucket':
        const salt = condition.additionalValues?.salt;
        const userHash = computeUserHash(
          salt + '.' + this._getUnitID(user, idType) ?? '',
        );
        value = Number(userHash % BigInt(USER_BUCKET_COUNT));
        break;
      case 'unit_id':
        value = this._getUnitID(user, idType);
        break;
      default:
        return { value: FETCH_FROM_SERVER, secondary_exposures: [] };
    }

    if (value === FETCH_FROM_SERVER) {
      return { value: FETCH_FROM_SERVER, secondary_exposures: [] };
    }

    const op = condition.operator?.toLowerCase();
    let evalResult = false;
    switch (op) {
      // numerical
      case 'gt':
        evalResult = numberCompare((a, b) => a > b)(value, target);
        break;
      case 'gte':
        evalResult = numberCompare((a, b) => a >= b)(value, target);
        break;
      case 'lt':
        evalResult = numberCompare((a, b) => a < b)(value, target);
        break;
      case 'lte':
        evalResult = numberCompare((a, b) => a <= b)(value, target);
        break;

      // version
      case 'version_gt':
        evalResult = versionCompareHelper((result) => result > 0)(
          versionCompare(value, target),
        );
        break;
      case 'version_gte':
        evalResult = versionCompareHelper((result) => result >= 0)(
          versionCompare(value, target),
        );
        break;
      case 'version_lt':
        evalResult = versionCompareHelper((result) => result < 0)(
          versionCompare(value, target),
        );
        break;
      case 'version_lte':
        evalResult = versionCompareHelper((result) => result <= 0)(
          versionCompare(value, target),
        );
        break;
      case 'version_eq':
        evalResult = versionCompareHelper((result) => result === 0)(
          versionCompare(value, target),
        );
        break;
      case 'version_neq':
        evalResult = versionCompareHelper((result) => result !== 0)(
          versionCompare(value, target),
        );
        break;

      // array
      case 'any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a === b),
        );
        break;
      case 'none':
        evalResult = !arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a === b),
        );
        break;
      case 'any_case_sensitive':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(false, (a, b) => a === b),
        );
        break;
      case 'none_case_sensitive':
        evalResult = !arrayAny(
          value,
          target,
          stringCompare(false, (a, b) => a === b),
        );
        break;

      // string
      case 'str_starts_with_any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.startsWith(b)),
        );
        break;
      case 'str_ends_with_any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.endsWith(b)),
        );
        break;
      case 'str_contains_any':
        evalResult = arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.includes(b)),
        );
        break;
      case 'str_contains_none':
        evalResult = !arrayAny(
          value,
          target,
          stringCompare(true, (a, b) => a.includes(b)),
        );
        break;
      case 'str_matches':
        try {
          if (String(value).length < 1000) {
            evalResult = new RegExp(target).test(String(value));
          } else {
            evalResult = false;
          }
        } catch (e) {
          evalResult = false;
        }
        break;
      // strictly equals
      case 'eq':
        evalResult = value === target;
        break;
      case 'neq':
        evalResult = value !== target;
        break;

      // dates
      case 'before':
        evalResult = dateCompare((a, b) => a < b)(value, target);
        break;
      case 'after':
        evalResult = dateCompare((a, b) => a > b)(value, target);
        break;
      case 'on':
        evalResult = dateCompare((a, b) => {
          a?.setHours(0, 0, 0, 0);
          b?.setHours(0, 0, 0, 0);
          return a?.getTime() === b?.getTime();
        })(value, target);
        break;
      case 'in_segment_list':
      case 'not_in_segment_list': {
        const list = SpecStore.store.idLists[target]?.ids;
        value = hashUnitIDForIDList(value);
        let inList = typeof list === 'object' && list[value] === true;
        evalResult = op === 'in_segment_list' ? inList : !inList;
        break;
      }
      default:
        return { value: FETCH_FROM_SERVER, secondary_exposures: [] };
    }
    return { value: evalResult, secondary_exposures: [] };
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

function hashUnitIDForIDList(unitID) {
  if (typeof unitID !== 'string' || unitID == null) {
    return '';
  }
  return crypto
    .createHash('sha256')
    .update(unitID)
    .digest('base64')
    .substr(0, 8);
}

function computeUserHash(userHash) {
  return crypto
    .createHash('sha256')
    .update(userHash)
    .digest()
    .readBigUInt64BE();
}

function getFromUser(user, field) {
  if (typeof user !== 'object') {
    return null;
  }
  return (
    user?.[field] ??
    user?.[field.toLowerCase()] ??
    user?.custom?.[field] ??
    user?.custom?.[field.toLowerCase()] ??
    user?.privateAttributes?.[field] ??
    user?.privateAttributes?.[field.toLowerCase()]
  );
}

function getFromIP(user, field) {
  const ip = getFromUser(user, 'ip');
  if (ip == null || field !== 'country') {
    return null;
  }
  return Evaluator.ip2country(ip);
}

function getFromUserAgent(user, field) {
  const ua = getFromUser(user, 'userAgent');
  if (ua == null) {
    return null;
  }
  // Fix the vulnerability in useragent library found here https://app.snyk.io/vuln/SNYK-JS-USERAGENT-174737
  if (typeof ua !== 'string' || ua.length > 1000) {
    return null;
  }
  const res = UAParser.parse(ua);
  switch (field.toLowerCase()) {
    case 'os_name':
    case 'osname':
      return res.os.family ?? null;
    case 'os_version':
    case 'osversion':
      return res.os.toVersion() ?? null;
    case 'browser_name':
    case 'browsername':
      return res.family ?? null;
    case 'browser_version':
    case 'browserversion':
      return res.toVersion() ?? null;
    default:
      return null;
  }
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

function versionCompareHelper(fn) {
  return (result) => {
    return result === false ? false : fn(result);
  };
}

// Compare two version strings without the extensions.
// returns -1, 0, or 1 if first is smaller than, equal to, or larger than second.
// returns false if any of the version strings is not valid.
function versionCompare(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string') {
    return false;
  }
  const version1 = removeVersionExtension(first);
  const version2 = removeVersionExtension(second);
  if (version1.length === 0 || version2.length === 0) {
    return false;
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
      return false;
    }
    if (n1 < n2) {
      return -1;
    } else if (n1 > n2) {
      return 1;
    }
  }
  return 0;
}

function removeVersionExtension(version) {
  const hyphenIndex = version.indexOf('-');
  if (hyphenIndex >= 0) {
    return version.substr(0, hyphenIndex);
  }
  return version;
}

function stringCompare(ignoreCase, fn) {
  return (a, b) => {
    if (a == null || b == null) {
      return false;
    }
    return ignoreCase
      ? fn(String(a).toLowerCase(), String(b).toLowerCase())
      : fn(String(a), String(b));
  };
}

function dateCompare(fn) {
  return (a, b) => {
    if (a == null || b == null) {
      return false;
    }
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

function arrayAny(value, array, fn) {
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

module.exports = Evaluator;

const ip3country = require('ip3country');
const { ConfigSpec, ConfigRule, ConfigCondition } = require('./ConfigSpec');
const SpecStore = require('./SpecStore');
const shajs = require('sha.js');
const parseUserAgent = require('./utils/parseUserAgent');
const ConfigEvaluation = require('./ConfigEvaluation').default;

const CONDITION_SEGMENT_COUNT = 10 * 1000;
const USER_BUCKET_COUNT = 1000;

const Evaluator = {
  async init(options, secretKey) {
    await SpecStore.init(options, secretKey);
    try {
      await ip3country.init();
    } catch (err) {
      // Ignore: this is optional
    }
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

  /**
   * @param {{ userID: string | number; }} user
   * @param {string} gateName
   * @returns {ConfigEvaluation}
   */
  lookupGateOverride(user, gateName) {
    const overrides = this.gateOverrides[gateName];
    if (overrides == null) {
      return null;
    }
    if (user.userID != null) {
      // check for a user level override
      const userOverride = overrides[user.userID];
      if (userOverride != null) {
        return new ConfigEvaluation(userOverride, 'override');
      }
    }

    // check if there is a global override
    const allOverride = overrides[''];
    if (allOverride != null) {
      return new ConfigEvaluation(allOverride, 'override');
    }
    return null;
  },

  /**
   * @param {{ userID: string | number; }} user
   * @param {string} configName
   * @returns {ConfigEvaluation}
   */
  lookupConfigOverride(user, configName) {
    const overrides = this.configOverrides[configName];
    if (overrides == null) {
      return null;
    }

    if (user.userID != null) {
      // check for a user level override
      const userOverride = overrides[user.userID];
      if (userOverride != null) {
        return new ConfigEvaluation(true, 'override', [], userOverride);
      }
    }

    // check if there is a global override
    const allOverride = overrides[''];
    if (allOverride != null) {
      return new ConfigEvaluation(true, 'override', [], allOverride);
    }
    return null;
  },

  /**
   * returns a object with 'value' and 'rule_id' properties, or null if used incorrectly (e.g. gate name does not exist or not initialized)
   * or 'FETCH_FROM_SERVER', which needs to be handled by caller by calling server endpoint directly
   * @param {object} user
   * @param {string} gateName
   * @returns {ConfigEvaluation | null}
   */
  checkGate(user, gateName) {
    if (!this.initialized) {
      return null;
    }

    return (
      this.lookupGateOverride(user, gateName) ??
      this._evalConfig(user, SpecStore.store.gates[gateName])
    );
  },

  /**
   * returns a ConfigEvaluation object, or null if used incorrectly (e.g. config name does not exist or not initialized).
   * The ConfigEvaluation may have fetchFromServer equal to true, which needs to be handled by caller by calling server endpoint directly
   * @param {object} user
   * @param {string} configName
   * @returns {ConfigEvaluation}
   */
  getConfig(user, configName) {
    if (!this.initialized) {
      return null;
    }

    return (
      this.lookupConfigOverride(user, configName) ??
      this._evalConfig(user, SpecStore.store.configs[configName])
    );
  },

  /**
   * @param {any} user
   * @param {string | number} layerName
   * @returns {ConfigEvaluation | null}
   */
  getLayer(user, layerName) {
    if (!this.initialized) {
      return null;
    }

    return this._evalConfig(user, SpecStore.store.layers[layerName]);
  },

  /**
   *
   * @param {object} user
   * @returns {Record<string, unknown>}
   */
  getClientInitializeResponse(user) {
    if (!SpecStore.isServingChecks()) {
      return null;
    }
    const gates = Object.entries(SpecStore.store.gates)
      .map(([gate, spec]) => {
        if (spec.entity === 'segment') {
          return null;
        }
        const res = this._eval(user, spec);
        return {
          name: getHashedName(gate),
          value: res.fetch_from_server ? false : res.value,
          rule_id: res.rule_id,
          secondary_exposures: this._cleanExposures(res.secondary_exposures),
        };
      })
      .filter((item) => item !== null);

    const configs = Object.entries(SpecStore.store.configs).map(
      ([config, spec]) => {
        const res = this._eval(user, spec);
        const format = this._specToInitializeResponse(spec, res);
        if (spec.entity !== 'dynamic_config') {
          const userInExperiment = this._isUserAllocatedToExperiment(
            user,
            spec,
          );
          const experimentActive = this._isExperimentActive(spec);
          // These parameters only control sticky experiments on the client
          format.is_experiment_active = experimentActive;
          format.is_user_in_experiment = userInExperiment;
        }

        return format;
      },
    );

    const layers = Object.entries(SpecStore.store.layers).map(
      ([layer, spec]) => {
        const res = this._eval(user, spec);
        const format = this._specToInitializeResponse(spec, res);
        if (res.config_delegate != null) {
          format.allocated_experiment_name = getHashedName(res.config_delegate);
          format.is_experiment_active = true;
          format.is_user_in_experiment = true;
        }
        format.explicit_parameters = format.explicit_parameters ?? [];
        format.undelegated_secondary_exposures = this._cleanExposures(
          res.undelegated_secondary_exposures ?? [],
        );
        return format;
      },
    );
    return {
      feature_gates: Object.assign(
        {},
        ...gates.map((item) => ({ [item.name]: item })),
      ),
      dynamic_configs: Object.assign(
        {},
        ...configs.map((item) => ({ [item.name]: item })),
      ),
      layer_configs: Object.assign(
        {},
        ...layers.map((item) => ({ [item.name]: item })),
      ),
      sdkParams: {},
      has_updates: true,
      time: 0, // set the time to 0 so this doesnt interfere with polling
    };
  },

  _specToInitializeResponse(spec, res) {
    const output = {
      name: getHashedName(spec.name),
      value: res.fetch_from_server ? {} : res.json_value,
      group: res.rule_id,
      rule_id: res.rule_id,
      is_device_based:
        spec.idType != null && spec.idType.toLowerCase() === 'stableid',
      secondary_exposures: this._cleanExposures(res.secondary_exposures),
    };

    if (res.explicit_parameters) {
      output['explicit_parameters'] = res.explicit_parameters;
    }

    return output;
  },

  _cleanExposures(exposures) {
    const seen = {};
    return exposures
      .map((exposure) => {
        const key = `${exposure.gate}|${exposure.gateValue}|${exposure.ruleID}`;
        if (seen[key]) {
          return null;
        }
        seen[key] = true;
        return exposure;
      })
      .filter((exposure) => exposure != null);
  },

  shutdown() {
    SpecStore.shutdown();
  },

  /**
   * @param {object} user
   * @param {ConfigSpec | null} config
   * @returns {ConfigEvaluation | null}
   */
  _evalConfig(user, config) {
    if (!config) {
      return null;
    }

    return this._eval(user, config);
  },

  /**
   * @param {object} user
   * @param {ConfigSpec} config
   * @returns {ConfigEvaluation}
   */
  _eval(user, config) {
    if (!config.enabled) {
      return new ConfigEvaluation(false, 'disabled', [], config.defaultValue);
    }

    let secondary_exposures = [];
    for (let i = 0; i < config.rules.length; i++) {
      let rule = config.rules[i];
      const ruleResult = this._evalRule(user, rule);
      if (ruleResult.fetch_from_server) {
        return ConfigEvaluation.fetchFromServer();
      }

      secondary_exposures = secondary_exposures.concat(
        ruleResult.secondary_exposures,
      );

      if (ruleResult.value === true) {
        const delegatedResult = this._evalDelegate(
          user,
          rule,
          secondary_exposures,
        );
        if (delegatedResult) {
          return delegatedResult;
        }

        const pass = this._evalPassPercent(user, rule, config);
        return new ConfigEvaluation(
          pass,
          ruleResult.rule_id,
          secondary_exposures,
          pass ? ruleResult.json_value : config.defaultValue,
          config.explicitParameters,
          ruleResult.config_delegate,
        );
      }
    }

    return new ConfigEvaluation(
      false,
      'default',
      secondary_exposures,
      config.defaultValue,
      config.explicitParameters,
    );
  },

  _evalDelegate(user, rule, exposures) {
    const config = SpecStore.store.configs[rule.configDelegate];
    if (!config) {
      return null;
    }

    const delegatedResult = this._eval(user, config);
    delegatedResult.config_delegate = rule.configDelegate;
    delegatedResult.undelegated_secondary_exposures = exposures;
    delegatedResult.explicit_parameters = config.explicitParameters;
    delegatedResult.secondary_exposures = exposures.concat(
      delegatedResult.secondary_exposures,
    );
    return delegatedResult;
  },

  _evalPassPercent(user, rule, config) {
    const hash = computeUserHash(
      config.salt +
        '.' +
        (rule.salt ?? rule.id) +
        '.' +
        (this._getUnitID(user, rule.idType) ?? ''),
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
   * @param {object} user
   * @param {ConfigRule} rule
   * @returns {ConfigEvaluation}
   */
  _evalRule(user, rule) {
    let secondaryExposures = [];
    let pass = true;

    for (const condition of rule.conditions) {
      const result = this._evalCondition(user, condition);
      if (result.fetchFromServer) {
        return ConfigEvaluation.fetchFromServer();
      }

      if (!result.passes) {
        pass = false;
      }

      if (result.exposures) {
        secondaryExposures = secondaryExposures.concat(result.exposures);
      }
    }

    return new ConfigEvaluation(
      pass,
      rule.id,
      secondaryExposures,
      rule.returnValue,
    );
  },

  /**
   * Evaluates the current condition, returns a boolean if the user pass or fail the condition,
   * but can also return a fetchFromServer boolean if the condition cannot be evaluated by the SDK.
   * @param {*} user
   * @param {ConfigCondition} condition
   * @returns {{passes: boolean, fetchFromServer?: boolean, exposures?: any[]}}
   */
  _evalCondition(user, condition) {
    let value = null;
    let field = condition.field;
    let target = condition.targetValue;
    let idType = condition.idType;
    switch (condition.type.toLowerCase()) {
      case 'public':
        return { passes: true };
      case 'fail_gate':
      case 'pass_gate':
        const gateResult = Evaluator.checkGate(user, target);
        if (gateResult?.fetch_from_server) {
          return { passes: false, fetchFromServer: true };
        }
        value = gateResult?.value;

        let allExposures = gateResult?.secondary_exposures ?? [];
        allExposures.push({
          gate: target,
          gateValue: String(value),
          ruleID: gateResult?.rule_id ?? '',
        });

        return {
          passes: condition.type.toLowerCase() === 'fail_gate' ? !value : value,
          exposures: allExposures,
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
        return { passes: false, fetchFromServer: true };
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
        evalResult = value == target;
        break;
      case 'neq':
        evalResult = value != target;
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
        return { passes: false, fetchFromServer: true };
    }
    return { passes: evalResult };
  },

  _isExperimentActive(experimentConfig) {
    for (const rule of experimentConfig.rules) {
      const ruleID = rule['id'];
      if (ruleID == null) {
        continue;
      }
      if (ruleID.toLowerCase() === 'layerassignment') {
        return true;
      }
    }
    return false;
  },

  _isUserAllocatedToExperiment(user, experimentConfig) {
    for (const rule of experimentConfig.rules) {
      const ruleID = rule['id'];
      if (ruleID == null) {
        continue;
      }
      if (ruleID.toLowerCase() === 'layerassignment') {
        const evalResult = this._evalRule(user, rule);
        // user is in an experiment when they FAIL the layerAssignment rule
        return !evalResult.value;
      }
    }
    return false;
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

function computeUserHash(userHash) {
  const buffer = shajs('sha256').update(userHash).digest();
  if (buffer.readBigUInt64BE) {
    return buffer.readBigUInt64BE();
  }

  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let ii = 0; ii < buffer.length; ii++) {
    view[ii] = buffer[ii];
  }

  const dv = new DataView(ab);
  return dv.getBigUint64(0, false);
}

function getHashedName(name) {
  return shajs('sha256').update(name).digest('base64');
}

function hashUnitIDForIDList(unitID) {
  if (typeof unitID !== 'string' || unitID == null) {
    return '';
  }
  return getHashedName(unitID).substr(0, 8);
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

module.exports = { Evaluator };

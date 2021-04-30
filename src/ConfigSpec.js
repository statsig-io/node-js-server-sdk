const { DynamicConfig } = require('./DynamicConfig');

export class ConfigSpec {
  constructor(specJSON) {
    this.name = specJSON.name;
    this.type = specJSON.type;
    this.salt = specJSON.salt;
    this.defaultValue = specJSON.defaultValue;
    this.enabled = specJSON.enabled;
    this.rules = this.parseRules(specJSON.rules);
  }

  parseRules(rulesJSON) {
    var rules = [];
    for (let ruleJSON in rulesJSON) {
      let rule = new ConfigRule(ruleJSON);
      rules.push(rule);
    }
    return rules;
  }

  evaluate(user) {
    for (let rule in this.rules) {
      if (rule.evaluate(user) === 'HELP') {
        return 'HELP';
      }
      if (rule.evaluate(user) === true) {
        return this.type === 'dynamicConfig'
          ? new DynamicConfig(this.name, rule.returnValue, rule.name)
          : true;
      }
    }
    return this.type === 'dynamicConfig'
      ? new DynamicConfig(this.name, this.defaultValue, 'default')
      : false;
  }
}

class ConfigRule {
  constructor(ruleJSON) {
    this.name = ruleJSON.name;
    this.passPercentage = ruleJSON.passPercentage;
    this.conditions = this.parseConditions(ruleJSON.conditions);
    this.returnValue = ruleJSON.returnValue;
  }

  parseConditions(conditionsJSON) {
    var conditions = [];
    for (let cJSON in conditionsJSON) {
      let condition = new ConfigCondition(cJSON);
      conditions.push(condition);
    }
    return conditions;
  }

  evaluate(user) {
    for (let condition in this.conditions) {
      if (condition.evaluate(user) === 'HELP') {
        return 'HELP';
      }
      if (condition.evaluate(user) === false) {
        return false;
      }
    }
    return true;
  }
}

class ConfigCondition {
  constructor(conditionJSON) {
    this.type = conditionJSON.type;
    this.targetValue = conditionJSON.value;
    this.operator = conditionJSON.operator;
    this.userField = conditionJSON.userField;
  }

  evaluate(user) {
    let value = null;
    switch (this.type.toLowerCase()) {
      case 'public':
        // use salt and return result
        break;
      case 'pass_gate':
        // find the gate and return gate.evaluate()
        break;
      case 'ip_based':
        // this would apply to things like 'country', 'region', etc.
        if (user[this.userField] || user.custom[this.userField]) {
          value = user[this.userField] ?? user.custom[this.userField];
        }
        // use IP to check
        value = getFromIP(user)[this.userField];
        break;
      case 'ua_based':
        // this would apply to things like 'os', 'browser', etc.
        if (user[this.userField] || user.custom[this.userField]) {
          value = user[this.userField] ?? user.custom[this.userField];
        }
        value = getFromUA(user)[this.userField];
        // use IP to check
        break;
      case 'user_field':
        value = user[this.userField] ?? user.custom[this.userField];
      default:
      // need to ask server for help
    }

    if (value == null) {
      return false;
    }

    switch (this.operator.toLowerCase()) {
      case 'is':
        return value === this.targetValue;
      case 'is_not':
        return value !== this.targetValue;
      case 'greater_than':
        return value > this.targetValue;
      case 'less_than':
        return value < this.targetValue;
      case 'version_greater_than':
        return versionCompare(value, this.targetValue) > 0;
      case 'version_less_than':
        return versionCompare(value, this.targetValue) < 0;
      case 'any':
        if (Array.isArray(value)) {
          return value.includes(this.targetValue);
        }
        return false;
      case 'none':
        if (Array.isArray(value)) {
          return !value.includes(this.targetValue);
        }
        return false;

      // TO ADD??
      case 'str_starts_with':
      case 'str_ends_with':
      case 'str_contains':
      case 'str_matches': //regex
    }
  }
}

const FETCH_FROM_SERVER = 'FETCH_FROM_SERVER';

class ConfigSpec {
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
    for (let i = 0; i < rulesJSON.length; i++) {
      let rule = new ConfigRule(rulesJSON[i]);
      rules.push(rule);
    }
    return rules;
  }
}

class ConfigRule {
  constructor(ruleJSON) {
    this.name = ruleJSON.name;
    this.passPercentage = ruleJSON.passPercentage;
    this.conditions = this.parseConditions(ruleJSON.conditions);
    this.returnValue = ruleJSON.returnValue;
    this.id = ruleJSON.id;
  }

  parseConditions(conditionsJSON) {
    var conditions = [];
    conditionsJSON?.forEach((cJSON) => {
      let condition = new ConfigCondition(cJSON);
      conditions.push(condition);
    });
    return conditions;
  }
}

class ConfigCondition {
  constructor(conditionJSON) {
    this.type = conditionJSON.type;
    this.targetValue = conditionJSON.targetValue;
    this.operator = conditionJSON.operator;
    this.field = conditionJSON.field;
  }
}

module.exports = { ConfigSpec, ConfigRule, ConfigCondition, FETCH_FROM_SERVER };

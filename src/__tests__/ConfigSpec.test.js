const { ConfigSpec } = require('../ConfigSpec');
const exampleConfigSpecs = require('./jest.setup');

describe('Verify behavior of ConfigSpec', () => {
  const gateSpec = new ConfigSpec(exampleConfigSpecs.gate);
  const halfPassGateSpec = new ConfigSpec(exampleConfigSpecs.half_pass_gate);
  const disabledGateSpec = new ConfigSpec(exampleConfigSpecs.disabled_gate);
  const dynamicConfigSpec = new ConfigSpec(exampleConfigSpecs.config);

  beforeEach(() => {});

  test('Test constructor works for feature gates', () => {
    expect(gateSpec).toBeTruthy();
    expect(gateSpec.type).toEqual('feature_gate');
    expect(gateSpec.name).toEqual('nfl_gate');
    expect(gateSpec.salt).toEqual('na');
    expect(gateSpec.enabled).toEqual(true);
    expect(gateSpec.defaultValue).toEqual(false);

    let rules = gateSpec.rules;
    expect(Array.isArray(rules)).toEqual(true);
    expect(rules.length).toEqual(1);

    let rule = rules[0];
    expect(rule.name).toEqual('employees');
    expect(rule.id).toEqual('rule_id_gate');
    expect(rule.passPercentage).toEqual(100);
    expect(rule.returnValue).toEqual(true);
    expect(rule.salt).toEqual('na');

    let conds = rule.conditions;
    expect(Array.isArray(conds)).toEqual(true);
    expect(conds.length).toEqual(1);

    let cond = conds[0];
    expect(cond.type).toEqual('user_field');
    expect(cond.targetValue).toEqual(['packers.com', 'nfl.com']);
    expect(cond.operator).toEqual('str_contains_any');
    expect(cond.field).toEqual('email');
  });

  test('Test constructor works for dynamic configs', () => {
    expect(dynamicConfigSpec).toBeTruthy();
    expect(dynamicConfigSpec.type).toEqual('dynamic_config');
    expect(dynamicConfigSpec.name).toEqual('teams');
    expect(dynamicConfigSpec.salt).toEqual('sodium');
    expect(dynamicConfigSpec.enabled).toEqual(true);
    expect(dynamicConfigSpec.defaultValue).toEqual({
      test: 'default',
    });

    let rules = dynamicConfigSpec.rules;
    expect(Array.isArray(rules)).toEqual(true);
    expect(rules.length).toEqual(2);

    let rule = rules[0];
    expect(rule.name).toEqual('can see teams');
    expect(rule.id).toEqual('rule_id_config');
    expect(rule.passPercentage).toEqual(100);
    expect(rule.returnValue).toEqual({
      packers: {
        name: 'Green Bay Packers',
        yearFounded: 1919,
      },
      seahawks: {
        name: 'Seattle Seahawks',
        yearFounded: 1974,
      },
    });
    expect(rule.salt).toEqual('sodium');

    let conds = rule.conditions;
    expect(Array.isArray(conds)).toEqual(true);
    expect(conds.length).toEqual(1);

    let cond = conds[0];
    expect(cond.type).toEqual('user_field');
    expect(cond.targetValue).toEqual(9);
    expect(cond.operator).toEqual('gte');
    expect(cond.field).toEqual('level');
  });

  test('Test evaluate works for gates', () => {
    expect(gateSpec.evaluate({})).toEqual({
      value: false,
      rule_id: 'default',
    });
    expect(gateSpec.evaluate({ userID: 'jkw' })).toEqual({
      value: false,
      rule_id: 'default',
    });
    expect(gateSpec.evaluate({ email: 'tore@packers.com' })).toEqual({
      value: true,
      rule_id: 'rule_id_gate',
    });
    expect(gateSpec.evaluate({ custom: { email: 'tore@nfl.com' } })).toEqual({
      value: true,
      rule_id: 'rule_id_gate',
    });
    expect(gateSpec.evaluate({ email: 'jkw@seahawks.com' })).toEqual({
      value: false,
      rule_id: 'default',
    });
    expect(disabledGateSpec.evaluate({ email: 'tore@packers.com' })).toEqual({
      value: false,
      rule_id: 'default',
    });
    expect(
      disabledGateSpec.evaluate({ custom: { email: 'tore@nfl.com' } })
    ).toEqual({
      value: false,
      rule_id: 'default',
    });
  });

  test('Pass percentage is "working"', () => {
    let passCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (
        halfPassGateSpec.evaluate({
          userID: Math.random(),
          email: 'tore@packers.com',
          // @ts-ignore
        }).value
      ) {
        passCount++;
      }
    }
    expect(passCount).toBeLessThan(600);
    expect(passCount).toBeGreaterThan(400);
  });

  test('Test evaluate works for dynamic configs', () => {
    // @ts-ignore
    expect(dynamicConfigSpec.evaluate({}).get()).toEqual({});
    expect(
      // @ts-ignore
      dynamicConfigSpec.evaluate({ userID: 'jkw', custom: { level: 10 } }).get()
    ).toEqual({
      packers: {
        name: 'Green Bay Packers',
        yearFounded: 1919,
      },
      seahawks: {
        name: 'Seattle Seahawks',
        yearFounded: 1974,
      },
    });
    expect(
      dynamicConfigSpec
        .evaluate({ userID: 'jkw', custom: { level: 10 } })
        // @ts-ignore
        .getRuleID()
    ).toEqual('rule_id_config');
    // @ts-ignore
    expect(dynamicConfigSpec.evaluate({ level: 5 }).get()).toEqual({});
    // @ts-ignore
    expect(dynamicConfigSpec.evaluate({ level: 5 }).getRuleID()).toEqual(
      'rule_id_config_public'
    );
  });
});

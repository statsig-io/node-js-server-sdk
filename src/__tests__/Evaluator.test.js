const { ConfigSpec, ConfigCondition, FETCH_FROM_SERVER } = require('../ConfigSpec');
const exampleConfigSpecs = require('./jest.setup');

describe('Test condition evaluation', () => {
  const baseTime = 1609459200000;
  const baseTimeStr = '2021-01-01T00:00:00.000Z';

  const user = {
    userID: 'jkw',
    country: 'US',
    custom: {
      os_name: 'iOS',
      company: 'Statsig',
    },
    statsigEnvironment: {
      tier: 'production'
    },
    privateAttributes: {
      level: 99,
      registration_date: baseTimeStr
    },
    customIDs: {
      space_id: '123',
    }
  }

  const user2 = {
    userID: 'jkw',
    ip: '123.456.789',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    custom: {
      company: 'Statsig',
      level: 99,
    },
    statsigEnvironment: {
      tier: 'staging'
    }
  }

  const params = [
    //type                operator          targetValue        field             user  result
    ['public',            null,             null,              null,             user, true],
    ['public',            'any',            false,             null,             user, true],
    ['fail_gate',         null,             'gate_pass',       null,             user, false],
    ['fail_gate',         null,             'gate_fail',       null,             user, true],
    ['pass_gate',         'fake',           'gate_pass',       null,             user, true],
    ['pass_gate',         null,             'gate_fail',       null,             user, false],
    ['pass_gate',         null,             'gate_server',     null,             user, FETCH_FROM_SERVER],
    ['fail_gate',         null,             'gate_server',     null,             user, FETCH_FROM_SERVER],

    // ip_based condition when ip is not provided
    ['ip_based',          'any',            ['US', 'CA'],      'country',        user, true],
    ['ip_based',          'none',           ['US', 'CA'],      'country',        user, false],
    ['ip_based',          'eq',             'US',              'country',        user, true],
    ['ip_based',          'neq',            'US',              'country',        user, false],
    ['ip_based',          'any',            ['US', 'CA'],      'city',           user, false],

    // ip_based condition when ip is provided
    ['ip_based',          'any',            ['US', 'CA'],      'country',        user2, true],
    ['ip_based',          'none',           ['US', 'CA'],      'country',        user2, false],
    ['ip_based',          'eq',             'US',              'country',        user2, true],
    ['ip_based',          'neq',            'US',              'country',        user2, false],
    ['ip_based',          'any',            ['US', 'CA'],      'city',           user2, false],

    // ua_based condition when ua is not provided
    ['ua_based',          'any',            ['Android', 'iOS'],'os_name',        user, true],
    ['ua_based',          'none',           ['Android', 'iOS'],'os_name',        user, false],
    ['ua_based',          'eq',             'iOS',             'os_name',        user, true],
    ['ua_based',          'neq',            'iOS',             'os_name',        user, false],

    // ua_based condition when ua is provided
    ['ua_based',          'any',            ['Android', 'iOS'],'os_name',        user2, true],
    ['ua_based',          'none',           ['Android', 'iOS'],'os_name',        user2, false],
    ['ua_based',          'eq',             'iOS',             'os_name',        user2, true],
    ['ua_based',          'neq',            'iOS',             'os_name',        user2, false],

    // version compare
    ['ua_based',          'version_gt',     '12.1',            'os_version',     user2, true],
    ['ua_based',          'version_gt',     '12.2',            'os_version',     user2, false],
    ['ua_based',          'version_gt',     '12.3',            'os_version',     user2, false],
    ['ua_based',          'version_gte',    '12.1',            'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.2',            'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.2.0',          'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.2.0.0',        'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.2.0.0',        'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.2-alpha',      'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.3',            'os_version',     user2, false],
    ['ua_based',          'version_lt',     '12.1',            'os_version',     user2, false],
    ['ua_based',          'version_lt',     '12.2',            'os_version',     user2, false],
    ['ua_based',          'version_lt',     '12.3',            'os_version',     user2, true],
    ['ua_based',          'version_lte',    '12.1',            'os_version',     user2, false],
    ['ua_based',          'version_lte',    '12.2',            'os_version',     user2, true],
    ['ua_based',          'version_lte',    '12.3',            'os_version',     user2, true],
    ['ua_based',          'version_eq',     '12.1',            'os_version',     user2, false],
    ['ua_based',          'version_eq',     '12.2',            'os_version',     user2, true],
    ['ua_based',          'version_eq',     '12.2.0',          'os_version',     user2, true],
    ['ua_based',          'version_eq',     '12.3',            'os_version',     user2, false],
    ['ua_based',          'version_neq',    '12.1',            'os_version',     user2, true],
    ['ua_based',          'version_neq',    '12.2',            'os_version',     user2, false],
    ['ua_based',          'version_neq',    '12.3',            'os_version',     user2, true],

    // numerical comparison on user_field
    ['user_field',         'gt',            98,               'level',             user, true],
    ['user_field',         'gt',            99,               'level',             user, false],
    ['user_field',         'gt',            100,              'level',             user, false],
    ['user_field',         'gte',           98,               'level',             user, true],
    ['user_field',         'gte',           99,               'level',             user, true],
    ['user_field',         'gte',           100,              'level',             user, false],
    ['user_field',         'lt',            98,               'level',             user, false],
    ['user_field',         'lt',            99,               'level',             user, false],
    ['user_field',         'lt',            100,              'level',             user, true],
    ['user_field',         'lte',           98,               'level',             user, false],
    ['user_field',         'lte',           99,               'level',             user, true],
    ['user_field',         'lte',           100,              'level',             user, true],

    // non-existent user field
    ['user_field',         'none',          ['v1', 'test'],    'fake',              user, true],

    // string comparison on user_field
    ['user_field',         'str_starts_with_any', ['Stat'],    'company',          user, true],
    ['user_field',         'str_starts_with_any', ['Statsig'], 'company',          user, true],
    ['user_field',         'str_starts_with_any', ['statsig'], 'company',          user, true],
    ['user_field',         'str_starts_with_any', ['sig'],     'company',          user, false],
    ['user_field',         'str_starts_with_any', [],          'company',          user, false],

    ['user_field',         'str_ends_with_any', ['Sig'],       'company',          user, true],
    ['user_field',         'str_ends_with_any', ['Statsig'],   'company',          user, true],
    ['user_field',         'str_ends_with_any', ['sig'],       'company',          user, true],
    ['user_field',         'str_ends_with_any', ['Stat'],      'company',          user, false],
  
    ['user_field',         'str_contains_any', ['Sig'],        'company',          user, true],
    ['user_field',         'str_contains_any', ['tatsi'],      'company',          user, true],
    ['user_field',         'str_contains_any', ['s'],          'company',          user, true],
    ['user_field',         'str_contains_any', ['Stat'],       'company',          user, true],
    ['user_field',         'str_contains_any', ['gis'],        'company',          user, false],
    ['user_field',         'str_contains_any', [],             'company',          user, false],

    ['user_field',         'str_matches',     'Sig.*',         'company',          user, false],
    ['user_field',         'str_matches',     'tatsi.',        'company',          user, true],
    ['user_field',         'str_matches',     'Statsig',       'company',          user, true],
    ['user_field',         'str_matches',     'Stat[1-9]',     'company',          user, false],
    ['user_field',         'str_matches',     'Stat+.',        'company',          user, true],

    // compare dates
    ['user_field',         'before',          '2021',         'registration_date', user, false],
    ['user_field',         'before',          '2022',         'registration_date', user, true],
    ['user_field',         'before',          '2021-01',      'registration_date', user, false],
    ['user_field',         'before',          '2021-02',      'registration_date', user, true],
    ['user_field',         'before',          '2021-01-01',   'registration_date', user, false],
    ['user_field',         'before',          '2021-01-02',   'registration_date', user, true],
    ['user_field',         'before',          baseTimeStr,    'registration_date', user, false],
    ['user_field',         'before',          '2021-01-01T00:01:00.000Z', 'registration_date', user, true],
    ['user_field',         'before',          baseTime,       'registration_date', user, false],
    ['user_field',         'before',          baseTime+1,     'registration_date', user, true],
    ['user_field',         'before',          String(baseTime), 'registration_date', user, false],
    ['user_field',         'before',          String(baseTime+1), 'registration_date', user, true],
         
    ['user_field',         'after',          '2021',          'registration_date', user, false],
    ['user_field',         'after',          '2020',          'registration_date', user, true],
    ['user_field',         'after',          '2021-01',       'registration_date', user, false],
    ['user_field',         'after',          '2020-12',       'registration_date', user, true],
    ['user_field',         'after',          '2021-01-01',    'registration_date', user, false],
    ['user_field',         'after',          '2020-12-31',    'registration_date', user, true],
    ['user_field',         'after',          baseTimeStr,     'registration_date', user, false],
    ['user_field',         'after',          '2020-12-31T11:59:00.000Z', 'registration_date', user, true],
    ['user_field',         'after',          baseTime,        'registration_date', user, false],
    ['user_field',         'after',          baseTime-1,      'registration_date', user, true],
    ['user_field',         'after',          String(baseTime), 'registration_date', user, false],
    ['user_field',         'after',          String(baseTime-1), 'registration_date', user, true],
         
    ['user_field',         'on',             '2021-01-01',    'registration_date', user, true],
    ['user_field',         'on',             '2020-12-31',    'registration_date', user, false],
    ['user_field',         'on',             baseTimeStr,     'registration_date', user, true],
    ['user_field',         'on',             '2020-12-31T00:00:00.000Z', 'registration_date', user, false],
    ['user_field',         'on',             baseTime,        'registration_date', user, true],
    ['user_field',         'on',             baseTime + 24 * 3600 * 1000, 'registration_date', user, false],
    ['user_field',         'on',             String(baseTime), 'registration_date', user, true],
    ['user_field',         'on',             String(baseTime + 24 * 3600 * 1000), 'registration_date', user, false],
            
    ['user_field',         'on',             {reason: 'test_malformated_str'}, 'registration_date', {custom: {registration_date: 'just_because'}}, false],
    ['user_field',         'on',             [1,2,3],    'registration_date', {custom: {registration_date: false}}, false],

    // environment_field
    ['environment_field',  'any',            ['production', 'Staging'], 'tier',   user,   true],
    ['environment_field',  'any',            ['production', 'Staging'], 'tier',   user2,  true],
    ['environment_field',  'any',            ['production'],            'tier',   user2,  false],
    ['environment_field',  'none',           ['production'],            'tier',   user2,  true],

    ['current_time',       'after',          Date.now() + 1000, null,             user, false],
    ['current_time',       'after',          Date.now() - 1000, null,             user, true],
    ['current_time',       'before',         Date.now() + 1000, null,             user, true],
    ['current_time',       'before',         Date.now() - 1000, null,             user, false],
    ['current_time',       'on',             Date.now() + 100, null,              user, true],
    ['current_time',       'on',             Date.now() + 24 * 3600 * 1000, null,              user, false],
    ['current_time',       'on',             Date.now() - 24 * 3600 * 1000, null,              user, false],

    // user bucket
    ['user_bucket',        'lt',              981,            null,              { userID: 1},  true, { salt:'himalayan salt' }],
    ['user_bucket',        'lt',              229,            null,              { userID: 18}, true,  { salt:'himalayan salt' }],
    ['user_bucket',        'gt',              980,            null,              { userID: 1},  false, { salt:'himalayan salt' }],
    ['user_bucket',        'gt',              229,            null,              { userID: 18}, false,  { salt:'himalayan salt' }],
    ['user_bucket',        'any',             [228, 333, 555],null,              { userID: 18}, true,  { salt:'himalayan salt' }],
    ['user_bucket',        'any',             [229, 333, 555],null,              { userID: 18}, false,  { salt:'himalayan salt' }],
    ['user_bucket',        'none',            [229, 333, 555],null,              { userID: 18}, true,  { salt:'himalayan salt' }],
   
    // some random type not implemented yet
    ['derived_field',      'eq',              '0.25',          'd1_retention',     user, FETCH_FROM_SERVER],

    // new operator
    ['user_field',         'unknown_op',      '0.25',          'level',            user, FETCH_FROM_SERVER],

    // any/none case sensitivity
    ['user_field',         'any_case_sensitive', ['Statsig', 'Take.app'],   'company',   user,  true],
    ['user_field',         'any_case_sensitive', ['statsig', 'take.app'],   'company',   user,  false],
    ['user_field',         'any', ['Statsig', 'Take.app'],   'company',   user,  true],
    ['user_field',         'any', ['statsig', 'take.app'],   'company',   user,  true],
    ['user_field',         'none_case_sensitive', ['Statsig', 'Take.app'],   'company',   user,  false],
    ['user_field',         'none_case_sensitive', ['statsig', 'take.app'],   'company',   user,  true],
    ['user_field',         'none', ['Statsig', 'Take.app'],   'company',   user,  false],
    ['user_field',         'none', ['statsig', 'take.app'],   'company',   user,  false],

    // unit id                                                      id type
    ['unit_id',            'any',             ['123'],              'space_id',             user, true],
    ['unit_id',            'any',             ['1234'],             'space_id',             user, false],
    ['unit_id',            'any',             ['jkw'],              'userID',               user, true],
    ['unit_id',            'any',             ['jkww'],             'userID',               user, false],
    ['unit_id',            'any',             ['123'],              'bad_id',               user, false],
    ['unit_id',            'in_segment_list', 'list_1',             'userID',               user, true],
    ['unit_id',            'in_segment_list', 'list_1',             'space_id',             user, true],
    ['unit_id',            'in_segment_list', 'list_1',             'bad_id',               user, false],
  ]

  const Evaluator = require('../Evaluator');
  jest.spyOn(Evaluator, 'checkGate').mockImplementation((user, gateName) => {
    if (gateName === 'gate_pass') return {value: true, rule_id: 'my_rule'};
    if (gateName === 'gate_server') return FETCH_FROM_SERVER;
    return {value: false, rule_id: 'default'};
  });
  jest.spyOn(Evaluator, 'ip2country').mockImplementation((ip) => 'US');

  const gateSpec = new ConfigSpec(exampleConfigSpecs.gate);
  const halfPassGateSpec = new ConfigSpec(exampleConfigSpecs.half_pass_gate);
  const halfPassGateCustomIDSpec = new ConfigSpec(exampleConfigSpecs.half_pass_custom_id_gate);
  const disabledGateSpec = new ConfigSpec(exampleConfigSpecs.disabled_gate);
  const dynamicConfigSpec = new ConfigSpec(exampleConfigSpecs.config);

  it('works', () => {
    const SpecStore = require('../SpecStore');
    SpecStore.store = {idLists: {list_1: {ids: {'jkw': true, '123': true}}}}
    params.forEach(p => {
      let json = {
        type: p[0],
        operator: p[1],
        targetValue: p[2],
        field: p[3],
        addtionalValues: p[6], // optional and does not exist for most conditions
      }
      if (p[0] === 'unit_id') {
        json.idType = json.field;
        json.field = null;
      }
      const condition = new ConfigCondition(json);
      const result = Evaluator._evalCondition(p[4], condition);
      if (result.value !== p[5]) {
        console.log(`Evaluation test failed for condition ${JSON.stringify(json)} and user ${JSON.stringify(p[4])}. \n\n Expected ${p[5]} but got ${result.value}`);
      }
      expect(result.value).toEqual(p[5]);
      if (p[2] === 'gate_pass') {
        expect(result.secondary_exposures).toEqual([{ gate: 'gate_pass', gateValue: 'true', ruleID: 'my_rule' }]);
      }
      if (p[2] === 'gate_fail') {
        expect(result.secondary_exposures).toEqual([{ gate: 'gate_fail', gateValue: 'false', ruleID: 'default' }]);
      }
    });
  });

  it('evals gates correctly', () => {
    expect(Evaluator._eval({}, gateSpec)).toEqual({
      value: false,
      rule_id: 'default',
      secondary_exposures: []
    });
    expect(Evaluator._eval({ userID: 'jkw' }, gateSpec)).toEqual({
      value: false,
      rule_id: 'default',
      secondary_exposures: []
    });
    expect(Evaluator._eval({ email: 'tore@packers.com' }, gateSpec)).toEqual({
      value: true,
      rule_id: 'rule_id_gate',
      secondary_exposures: []
    });
    expect(Evaluator._eval({ custom: { email: 'tore@nfl.com' } }, gateSpec)).toEqual({
      value: true,
      rule_id: 'rule_id_gate',
      secondary_exposures: []
    });
    expect(Evaluator._eval({ email: 'jkw@seahawks.com' }, gateSpec)).toEqual({
      value: false,
      rule_id: 'default',
      secondary_exposures: []
    });
    expect(Evaluator._eval({ email: 'tore@packers.com' }, disabledGateSpec)).toEqual({
      value: false,
      rule_id: 'disabled',
      secondary_exposures: []
    });
    expect(
      Evaluator._eval({ custom: { email: 'tore@nfl.com' } }, disabledGateSpec)
    ).toEqual({
      value: false,
      rule_id: 'disabled',
      secondary_exposures: []
    });
  });

  it('implements pass percentage correctly', () => {
    let passCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (
        Evaluator._eval({
          userID: Math.random(),
          email: 'tore@packers.com',
          // @ts-ignore
        }, halfPassGateSpec).value
      ) {
        passCount++;
      }
    }
    expect(passCount).toBeLessThan(600);
    expect(passCount).toBeGreaterThan(400);
  });

  it('implements pass percentage correctly', () => {
    let valueID1 = Evaluator._eval({
      userID: Math.random(),
      email: 'tore@packers.com',
      customIDs: {teamID: '3'}
    }, halfPassGateCustomIDSpec).value
    let valueID2 = Evaluator._eval({
      userID: Math.random(),
      email: 'tore@packers.com',
      customIDs: {teamID: '2'}
    }, halfPassGateCustomIDSpec).value
    expect(valueID1).toEqual(true);
    expect(valueID2).toEqual(false);
  });

  it('uses the correct return value and ruleID after evaluating pass percentage', () => {
    const Evaluator = require('../Evaluator');
    jest.spyOn(Evaluator, '_evalPassPercent').mockImplementation(() => {
      return false;
    });
    const failResult = Evaluator._eval({
      userID: Math.random(),
      email: 'tore@packers.com',
      // @ts-ignore
    }, halfPassGateSpec);

    expect(failResult.rule_id).toEqual(halfPassGateSpec.rules[0].id);
    expect(failResult.value).toEqual(false);

    jest.spyOn(Evaluator, '_evalPassPercent').mockImplementation(() => {
      return true;
    });
    const passResult = Evaluator._eval({
      userID: Math.random(),
      email: 'tore@packers.com',
      // @ts-ignore
    }, halfPassGateSpec);

    expect(passResult.rule_id).toEqual(halfPassGateSpec.rules[0].id);
    expect(passResult.value).toEqual(true);
  });

  it('evals dynamic configs correctly', () => {
    // @ts-ignore
    expect(Evaluator._eval({}, dynamicConfigSpec).get()).toEqual({});
    expect(
      // @ts-ignore
      Evaluator._eval({ userID: 'jkw', custom: { level: 10 } }, dynamicConfigSpec).get()
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
      Evaluator
        ._eval({ userID: 'jkw', custom: { level: 10 } }, dynamicConfigSpec)
        // @ts-ignore
        .getRuleID()
    ).toEqual('rule_id_config');
    // @ts-ignore
    expect(Evaluator._eval({ level: 5 }, dynamicConfigSpec).get()).toEqual({});
    // @ts-ignore
    expect(Evaluator._eval({ level: 5 }, dynamicConfigSpec).getRuleID()).toEqual(
      'rule_id_config_public'
    );
  });
});

describe('testing checkGate and getConfig', () => {
  const { DynamicConfig } = require('../DynamicConfig');

  let Evaluator;
  let fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    Evaluator = require('../Evaluator');
    fetch = require('node-fetch');
    jest.mock('node-fetch', () => jest.fn());

    const jsonResponse = {
      time: Date.now(),
      feature_gates: [
        exampleConfigSpecs.gate,
        exampleConfigSpecs.disabled_gate,
      ],
      dynamic_configs: [exampleConfigSpecs.config],
      has_updates: true,
    };
    fetch.mockImplementation((url) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(jsonResponse),
          text: () => Promise.resolve(JSON.stringify(jsonResponse)),
        });
      }
      return Promise.reject();
    });

    let now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
  });

  test('checkGate() behavior', async () => {
    // calling before initialize should return null
    expect(
      Evaluator.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.gate.name
      )
    ).toEqual(null);

    await Evaluator.init({}, 'secret-api-key', 1000);
    // check a gate that should evaluate to true
    expect(
      Evaluator.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.gate.name
      )
    ).toEqual({ value: true, rule_id: exampleConfigSpecs.gate.rules[0].id, secondary_exposures: [] });

    // should evaluate to false
    expect(
      Evaluator.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.gate.name
      )
    ).toEqual({ value: false, rule_id: 'default', secondary_exposures: [] });

    // non-existent gate should return null
    expect(
      Evaluator.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.gate.name + 'non-existent-gate'
      )
    ).toEqual(null);
  });

  test('getConfig() behavior', async () => {
    // calling before initialize should return null
    expect(
      Evaluator.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.config.name
      )
    ).toEqual(null);

    await Evaluator.init({}, 'secret-api-key');

    // check a config that should evaluate to real return value
    expect(
      Evaluator.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com', level: 10 } },
        exampleConfigSpecs.config.name
      )
    ).toEqual(
      new DynamicConfig(
        exampleConfigSpecs.config.name,
        exampleConfigSpecs.config.rules[0].returnValue,
        exampleConfigSpecs.config.rules[0].id
      )
    );

    // non-existent config should return null
    expect(
      Evaluator.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.config.name + 'non-existent-config'
      )
    ).toEqual(null);
  });

  test('ip2country() behavior', async () => {
    expect(Evaluator.ip2country('1.0.0.255')).toEqual(null);
    await Evaluator.init({}, 'secret-api-key');
    expect(Evaluator.ip2country('1.0.0.255')).toEqual('US');
    expect(Evaluator.ip2country(16777471)).toEqual('US');
    expect(Evaluator.ip2country({})).toEqual(null);
  });
});
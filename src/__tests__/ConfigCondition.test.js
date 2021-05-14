const { ConfigCondition, FETCH_FROM_SERVER } = require('../ConfigSpec');
describe('Test condition evaluation', () => {
  const baseTime = 1609459200000;
  const baseTimeStr = '2021-01-01T00:00:00.000Z';

  const user = {
    userID: 'jkw',
    country: 'US',
    custom: {
      os_name: 'iOS',
      company: 'Statsig',
      level: 99,
      registration_date: baseTimeStr
    },
  }

  const user2 = {
    userID: 'jkw',
    ip: '123.456.789',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    custom: {
      company: 'Statsig',
      level: 99,
    },
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
    ['ip_based',          'any',            ['US', 'CA'],      'city',           user2, FETCH_FROM_SERVER],

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
    ['ua_based',          'any',            ['12.2', '12.3'],  'os_version',     user2, true],
    ['ua_based',          'none',           ['12.2', '12.3'],  'os_version',     user2, false],

    // semver compare
    ['ua_based',          'version_ge',     '12.1',            'os_version',     user2, true],
    ['ua_based',          'version_ge',     '12.2',            'os_version',     user2, false],
    ['ua_based',          'version_ge',     '12.3',            'os_version',     user2, false],
    ['ua_based',          'version_gte',    '12.1',            'os_version',     user2, true],
    ['ua_based',          'version_gte',    '12.2',            'os_version',     user2, true],
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

    ['current_time',       'after',          Date.now() + 1000, null,             user, false],
    ['current_time',       'after',          Date.now() - 1000, null,             user, true],
    ['current_time',       'before',         Date.now() + 1000, null,             user, true],
    ['current_time',       'before',         Date.now() - 1000, null,             user, false],
    ['current_time',       'on',             Date.now() + 100, null,              user, true],
    ['current_time',       'on',             Date.now() + 24 * 3600 * 1000, null,              user, false],
    ['current_time',       'on',             Date.now() - 24 * 3600 * 1000, null,              user, false],
   
    // some random type not implemented yet
    ['derived_field',      'eq',              '0.25',          'd1_retention',     user, FETCH_FROM_SERVER],

    // new operator
    ['user_field',         'unknown_op',      '0.25',          'bad_field',        user, false], // return false if user_field does not exist
    ['user_field',         'unknown_op',      '0.25',          'level',            user, FETCH_FROM_SERVER],
  ]

  const SpecStore = require('../SpecStore');
  jest.spyOn(SpecStore, 'checkGate').mockImplementation((user, gateName) => {
    if (gateName === 'gate_pass') return true;
    if (gateName === 'gate_server') return FETCH_FROM_SERVER;
    return false;
  });
  jest.spyOn(SpecStore, 'ip2country').mockImplementation((ip) => 'US');

  it('works', () => {
    params.forEach(p => {
      let json = {
        type: p[0],
        operator: p[1],
        targetValue: p[2],
        field: p[3],
      }
      const condition = new ConfigCondition(json);
      expect(condition.evaluate(p[4])).toEqual(p[5]);
    });
  });
});
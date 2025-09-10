import ConfigEvaluation from '../ConfigEvaluation';
import { ConfigCondition, ConfigSpec } from '../ConfigSpec';
import Diagnostics from '../Diagnostics';
import ErrorBoundary from '../ErrorBoundary';
import Evaluator from '../Evaluator';
import LogEventProcessor from '../LogEventProcessor';
import SpecStore from '../SpecStore';
import { OptionsLoggingCopy, OptionsWithDefaults } from '../StatsigOptions';
import { StatsigUser } from '../StatsigUser';
import {
  EvaluationContext,
  InitializeContext,
  StatsigContext,
} from '../utils/StatsigContext';
import StatsigFetcher from '../utils/StatsigFetcher';
const exampleConfigSpecs = require('./jest.setup');

describe('Test condition evaluation', () => {
  const options = OptionsWithDefaults({ loggingMaxBufferSize: 1 });
  const logger = new LogEventProcessor(
    new StatsigFetcher(
      'secret-asdf1234',
      options,
      new ErrorBoundary(
        'secret-asdf1234',
        OptionsLoggingCopy(options),
        'sessionid-a',
      ),
      'sessionid-a',
    ),
    new ErrorBoundary('secret-asdf1234', options, 'sessionid-a'),
    options,
    OptionsLoggingCopy(options),
    'sessionid-a',
  );
  beforeEach(() => {
    Diagnostics.initialize({ logger });
  });

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
      tier: 'production',
    },
    privateAttributes: {
      level: 99,
      registration_date: baseTimeStr,
    },
    customIDs: {
      space_id: '123',
    },
  };

  const user2 = {
    userID: 'jkw',
    ip: '123.456.789',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    custom: {
      company: 'Statsig',
      level: 99,
    },
    statsigEnvironment: {
      tier: 'staging',
    },
  };

  // prettier-ignore
  const params = [
    //type                operator          targetValue        field             user  result   additionalValues   unsupported
    ['public', null, null, null, user, true],
    ['public', 'any', false, null, user, true],
    ['fail_gate', null, 'gate_pass', null, user, false],
    ['fail_gate', null, 'gate_fail', null, user, true],
    ['pass_gate', 'fake', 'gate_pass', null, user, true],
    ['pass_gate', null, 'gate_fail', null, user, false],
    ['pass_gate', null, 'gate_server', null, user, false, undefined, true],
    ['fail_gate', null, 'gate_server', null, user, false, undefined, true],
    ['multi_pass_gate', null, ['gate_pass'], null, user, true],
    ['multi_pass_gate', null, ['gate_pass', 'gate_fail'], null, user, true],
    ['multi_pass_gate', null, ['gate_fail', 'gate_pass', 'gate_server'], null, user, true],
    ['multi_pass_gate', null, ['gate_fail'], null, user, false],
    ['multi_pass_gate', null, ['gate_server', 'gate_pass'], null, user, false, undefined, true],
    ['multi_fail_gate', null, ['gate_pass'], null, user, false],
    ['multi_fail_gate', null, ['gate_pass', 'gate_fail'], null, user, true],
    ['multi_fail_gate', null, ['gate_fail', 'gate_pass', 'gate_server'], null, user, true],
    ['multi_fail_gate', null, ['gate_fail'], null, user, true],
    ['multi_fail_gate', null, ['gate_server', 'gate_fail'], null, user, false, undefined, true],

    // ip_based condition when ip is not provided
    ['ip_based', 'any', ['US', 'CA'], 'country', user, true],
    ['ip_based', 'none', ['US', 'CA'], 'country', user, false],
    ['ip_based', 'eq', 'US', 'country', user, true],
    ['ip_based', 'neq', 'US', 'country', user, false],
    ['ip_based', 'any', ['US', 'CA'], 'city', user, false],

    // ip_based condition when ip is provided
    ['ip_based', 'any', ['US', 'CA'], 'country', user2, true],
    ['ip_based', 'none', ['US', 'CA'], 'country', user2, false],
    ['ip_based', 'eq', 'US', 'country', user2, true],
    ['ip_based', 'neq', 'US', 'country', user2, false],
    ['ip_based', 'any', ['US', 'CA'], 'city', user2, false],

    // ua_based condition when ua is not provided
    ['ua_based', 'any', ['Android', 'iOS'], 'os_name', user, true],
    ['ua_based', 'none', ['Android', 'iOS'], 'os_name', user, false],
    ['ua_based', 'eq', 'iOS', 'os_name', user, true],
    ['ua_based', 'neq', 'iOS', 'os_name', user, false],

    // ua_based condition when ua is provided
    ['ua_based', 'any', ['Android', 'iOS'], 'os_name', user2, true],
    ['ua_based', 'none', ['Android', 'iOS'], 'os_name', user2, false],
    ['ua_based', 'eq', 'iOS', 'os_name', user2, true],
    ['ua_based', 'neq', 'iOS', 'os_name', user2, false],

    // version compare
    ['ua_based', 'version_gt', '12.1', 'os_version', user2, true],
    ['ua_based', 'version_gt', '12.2', 'os_version', user2, false],
    ['ua_based', 'version_gt', '12.3', 'os_version', user2, false],
    ['ua_based', 'version_gte', '12.1', 'os_version', user2, true],
    ['ua_based', 'version_gte', '12.2', 'os_version', user2, true],
    ['ua_based', 'version_gte', '12.2.0', 'os_version', user2, true],
    ['ua_based', 'version_gte', '12.2.0.0', 'os_version', user2, true],
    ['ua_based', 'version_gte', '12.2.0.0', 'os_version', user2, true],
    ['ua_based', 'version_gte', '12.2-alpha', 'os_version', user2, true],
    ['ua_based', 'version_gte', '12.3', 'os_version', user2, false],
    ['ua_based', 'version_lt', '12.1', 'os_version', user2, false],
    ['ua_based', 'version_lt', '12.2', 'os_version', user2, false],
    ['ua_based', 'version_lt', '12.3', 'os_version', user2, true],
    ['ua_based', 'version_lte', '12.1', 'os_version', user2, false],
    ['ua_based', 'version_lte', '12.2', 'os_version', user2, true],
    ['ua_based', 'version_lte', '12.3', 'os_version', user2, true],
    ['ua_based', 'version_eq', '12.1', 'os_version', user2, false],
    ['ua_based', 'version_eq', '12.2', 'os_version', user2, true],
    ['ua_based', 'version_eq', '12.2.0', 'os_version', user2, true],
    ['ua_based', 'version_eq', '12.3', 'os_version', user2, false],
    ['ua_based', 'version_neq', '12.1', 'os_version', user2, true],
    ['ua_based', 'version_neq', '12.2', 'os_version', user2, false],
    ['ua_based', 'version_neq', '12.3', 'os_version', user2, true],

    // numerical comparison on user_field
    ['user_field', 'gt', 98, 'level', user, true],
    ['user_field', 'gt', 99, 'level', user, false],
    ['user_field', 'gt', 100, 'level', user, false],
    ['user_field', 'gte', 98, 'level', user, true],
    ['user_field', 'gte', 99, 'level', user, true],
    ['user_field', 'gte', 100, 'level', user, false],
    ['user_field', 'lt', 98, 'level', user, false],
    ['user_field', 'lt', 99, 'level', user, false],
    ['user_field', 'lt', 100, 'level', user, true],
    ['user_field', 'lte', 98, 'level', user, false],
    ['user_field', 'lte', 99, 'level', user, true],
    ['user_field', 'lte', 100, 'level', user, true],

    // non-existent user field
    ['user_field', 'none', ['v1', 'test'], 'fake', user, true],

    // string comparison on user_field
    ['user_field', 'str_starts_with_any', ['Stat'], 'company', user, true],
    ['user_field', 'str_starts_with_any', ['Statsig'], 'company', user, true],
    ['user_field', 'str_starts_with_any', ['statsig'], 'company', user, true],
    ['user_field', 'str_starts_with_any', ['sig'], 'company', user, false],
    ['user_field', 'str_starts_with_any', [], 'company', user, false],

    ['user_field', 'str_ends_with_any', ['Sig'], 'company', user, true],
    ['user_field', 'str_ends_with_any', ['Statsig'], 'company', user, true],
    ['user_field', 'str_ends_with_any', ['sig'], 'company', user, true],
    ['user_field', 'str_ends_with_any', ['Stat'], 'company', user, false],

    ['user_field', 'str_contains_any', ['Sig'], 'company', user, true],
    ['user_field', 'str_contains_any', ['tatsi'], 'company', user, true],
    ['user_field', 'str_contains_any', ['s'], 'company', user, true],
    ['user_field', 'str_contains_any', ['Stat'], 'company', user, true],
    ['user_field', 'str_contains_any', ['gis'], 'company', user, false],
    ['user_field', 'str_contains_any', [], 'company', user, false],

    ['user_field', 'str_matches', 'Sig.*', 'company', user, false],
    ['user_field', 'str_matches', 'tatsi.', 'company', user, true],
    ['user_field', 'str_matches', 'Statsig', 'company', user, true],
    ['user_field', 'str_matches', 'Stat[1-9]', 'company', user, false],
    ['user_field', 'str_matches', 'Stat+.', 'company', user, true],

    // compare dates
    ['user_field', 'before', '2021', 'registration_date', user, false],
    ['user_field', 'before', '2022', 'registration_date', user, true],
    ['user_field', 'before', '2021-01', 'registration_date', user, false],
    ['user_field', 'before', '2021-02', 'registration_date', user, true],
    ['user_field', 'before', '2021-01-01', 'registration_date', user, false],
    ['user_field', 'before', '2021-01-02', 'registration_date', user, true],
    ['user_field', 'before', baseTimeStr, 'registration_date', user, false],
    ['user_field', 'before', '2021-01-01T00:01:00.000Z', 'registration_date', user, true],
    ['user_field', 'before', baseTime, 'registration_date', user, false],
    ['user_field', 'before', baseTime + 1, 'registration_date', user, true],
    ['user_field', 'before', String(baseTime), 'registration_date', user, false],
    ['user_field', 'before', String(baseTime + 1), 'registration_date', user, true],

    ['user_field', 'after', '2021', 'registration_date', user, false],
    ['user_field', 'after', '2020', 'registration_date', user, true],
    ['user_field', 'after', '2021-01', 'registration_date', user, false],
    ['user_field', 'after', '2020-12', 'registration_date', user, true],
    ['user_field', 'after', '2021-01-01', 'registration_date', user, false],
    ['user_field', 'after', '2020-12-31', 'registration_date', user, true],
    ['user_field', 'after', baseTimeStr, 'registration_date', user, false],
    ['user_field', 'after', '2020-12-31T11:59:00.000Z', 'registration_date', user, true],
    ['user_field', 'after', baseTime, 'registration_date', user, false],
    ['user_field', 'after', baseTime - 1, 'registration_date', user, true],
    ['user_field', 'after', String(baseTime), 'registration_date', user, false],
    ['user_field', 'after', String(baseTime - 1), 'registration_date', user, true],

    ['user_field', 'on', '2021-01-01', 'registration_date', user, true],
    ['user_field', 'on', '2020-12-31', 'registration_date', user, false],
    ['user_field', 'on', baseTimeStr, 'registration_date', user, true],
    ['user_field', 'on', '2020-12-31T00:00:00.000Z', 'registration_date', user, false],
    ['user_field', 'on', baseTime, 'registration_date', user, true],
    ['user_field', 'on', baseTime + 24 * 3600 * 1000, 'registration_date', user, false],
    ['user_field', 'on', String(baseTime), 'registration_date', user, true],
    ['user_field', 'on', String(baseTime + 24 * 3600 * 1000), 'registration_date', user, false],

    ['user_field', 'on', { reason: 'test_malformated_str' }, 'registration_date', { custom: { registration_date: 'just_because' } }, false],
    ['user_field', 'on', [1, 2, 3], 'registration_date', { custom: { registration_date: false } }, false],

    // environment_field
    ['environment_field', 'any', ['production', 'Staging'], 'tier', user, true],
    ['environment_field', 'any', ['production', 'Staging'], 'tier', user2, true],
    ['environment_field', 'any', ['production'], 'tier', user2, false],
    ['environment_field', 'none', ['production'], 'tier', user2, true],

    ['current_time', 'after', Date.now() + 1000, null, user, false],
    ['current_time', 'after', Date.now() - 1000, null, user, true],
    ['current_time', 'before', Date.now() + 1000, null, user, true],
    ['current_time', 'before', Date.now() - 1000, null, user, false],
    ['current_time', 'on', Date.now() + 100, null, user, true],
    ['current_time', 'on', Date.now() + 24 * 3600 * 1000, null, user, false],
    ['current_time', 'on', Date.now() - 24 * 3600 * 1000, null, user, false],

    // user bucket
    ['user_bucket', 'lt', 981, null, { userID: 1 }, true, { salt: 'himalayan salt' }],
    ['user_bucket', 'lt', 542, null, { userID: 18 }, true, { salt: 'himalayan salt' }],
    ['user_bucket', 'gt', 980, null, { userID: 1 }, false, { salt: 'himalayan salt' }],
    ['user_bucket', 'gt', 542, null, { userID: 18 }, false, { salt: 'himalayan salt' }],
    ['user_bucket', 'any', [541, 333, 555], null, { userID: 18 }, true, { salt: 'himalayan salt' }],
    ['user_bucket', 'any', [542, 333, 555], null, { userID: 18 }, false, { salt: 'himalayan salt' }],
    ['user_bucket', 'none', [542, 333, 555], null, { userID: 18 }, true, { salt: 'himalayan salt' }],

    // some random type not implemented yet
    ['derived_field', 'eq', '0.25', 'd1_retention', user, false, undefined, true],

    // new operator
    ['user_field', 'unknown_op', '0.25', 'level', user, false, undefined, true],

    // any/none case sensitivity
    ['user_field', 'any_case_sensitive', ['Statsig', 'Take.app'], 'company', user, true],
    ['user_field', 'any_case_sensitive', ['statsig', 'take.app'], 'company', user, false],
    ['user_field', 'any', ['Statsig', 'Take.app'], 'company', user, true],
    ['user_field', 'any', ['statsig', 'take.app'], 'company', user, true],
    ['user_field', 'none_case_sensitive', ['Statsig', 'Take.app'], 'company', user, false],
    ['user_field', 'none_case_sensitive', ['statsig', 'take.app'], 'company', user, true],
    ['user_field', 'none', ['Statsig', 'Take.app'], 'company', user, false],
    ['user_field', 'none', ['statsig', 'take.app'], 'company', user, false],

    // unit id                                                      id type
    ['unit_id', 'any', ['123'], 'space_id', user, true],
    ['unit_id', 'any', ['1234'], 'space_id', user, false],
    ['unit_id', 'any', ['jkw'], 'userID', user, true],
    ['unit_id', 'any', ['jkww'], 'userID', user, false],
    ['unit_id', 'any', ['123'], 'bad_id', user, false],
    ['unit_id', 'in_segment_list', 'list_1', 'userID', user, true],
    ['unit_id', 'in_segment_list', 'list_1', 'space_id', user, true],
    ['unit_id', 'in_segment_list', 'list_1', 'bad_id', user, false],

    // eq, neq
    ['user_field', 'neq', null, 'email', { email: 'something' }, true],
    ['user_field', 'eq', null, 'email', { email: 'something' }, false],
    ['user_field', 'eq', null, 'nullable', { custom: {} }, true],
    ['user_field', 'eq', null, 'nullable', { custom: { nullable: null } }, true],
    ['user_field', 'eq', null, 'nullable', { custom: { nullable: 'sth' } }, false],
  ]

  const defaultOptions = OptionsWithDefaults({});
  const fetcher = new StatsigFetcher(
    'secret-123',
    defaultOptions,
    new ErrorBoundary(
      'secret-123',
      OptionsLoggingCopy(defaultOptions),
      'session-123',
    ),
    'session-123',
  );
  const store = new SpecStore('secret-123', fetcher, defaultOptions);
  const mockedEvaluator = new Evaluator(OptionsWithDefaults({}), store);
  jest
    .spyOn(mockedEvaluator, 'checkGate')
    .mockImplementation((user, gateName) => {
      if (gateName === 'gate_pass') {
        return new ConfigEvaluation(true, 'my_rule');
      }

      if (gateName === 'gate_server') {
        return ConfigEvaluation.unsupported(-1, -1);
      }

      return new ConfigEvaluation(false, 'default');
    });
  jest.spyOn(mockedEvaluator, 'ip2country').mockImplementation((ip) => 'US');

  const gateSpec = new ConfigSpec(exampleConfigSpecs.gate);
  const halfPassGateSpec = new ConfigSpec(exampleConfigSpecs.half_pass_gate);
  const halfPassGateCustomIDSpec = new ConfigSpec(
    exampleConfigSpecs.half_pass_custom_id_gate,
  );
  const disabledGateSpec = new ConfigSpec(exampleConfigSpecs.disabled_gate);
  const dynamicConfigSpec = new ConfigSpec(exampleConfigSpecs.config);

  it('works', () => {
    const defaultOptions = OptionsWithDefaults({});
    const network = new StatsigFetcher(
      'secret-123',
      defaultOptions,
      new ErrorBoundary(
        'secret-123',
        OptionsLoggingCopy(defaultOptions),
        'session-123',
      ),
      'session-123',
    );
    const store = new SpecStore(
      'secret-123',
      network,
      OptionsWithDefaults({ api: 'https://statsigapi.net/v1' }),
    );
    // @ts-ignore
    store.store = {
      // @ts-ignore
      idLists: { list_1: { ids: { '7NRRgkdK': true, pmWkWSBC: true } } },
      configs: {},
    };
    // @ts-ignore
    mockedEvaluator.store = store;
    params.forEach(
      ([
        type,
        operator,
        targetValue,
        field,
        user,
        evalPasses,
        additionalValues,
        unsupported,
      ]) => {
        const json = {
          type,
          operator,
          targetValue,
          field,
          additionalValues, // optional and does not exist for most conditions
        };
        if (type === 'unit_id') {
          // @ts-ignore
          json.idType = json.field;
          json.field = null;
        }
        const condition = new ConfigCondition(json);
        // Create a minimal context for testing condition evaluation
        // @ts-ignore - user can be various types in test scenarios
        const testContext = EvaluationContext.new({
          // @ts-ignore
          user: user || {},
          spec: new ConfigSpec({ name: 'test_config', rules: [] }),
        });
        // @ts-ignore
        const result = mockedEvaluator._evalCondition(
          // @ts-ignore
          user,
          condition,
          testContext,
        );
        if (
          result.passes !== evalPasses ||
          result.unsupported !== unsupported
        ) {
          console.log(
            `Evaluation test failed for condition ${JSON.stringify(
              json,
            )} and user ${JSON.stringify(
              user,
            )}. \n\n Expected ${evalPasses} but got ${result.passes}`,
          );
        }
        expect(result.passes).toEqual(evalPasses);
        if (targetValue === 'gate_pass') {
          expect(result.exposures).toEqual([
            { gate: 'gate_pass', gateValue: 'true', ruleID: 'my_rule' },
          ]);
        }
        if (targetValue === 'gate_fail') {
          expect(result.exposures).toEqual([
            { gate: 'gate_fail', gateValue: 'false', ruleID: 'default' },
          ]);
        }
      },
    );
  });

  it('evals gates correctly', () => {
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: {},
          spec: gateSpec,
        }),
      ),
    ).toEqual(new ConfigEvaluation(false, 'default', null, 'teamID', [], {}));
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          user: { userID: 'jkw' },
          spec: gateSpec,
        }),
      ),
    ).toEqual(new ConfigEvaluation(false, 'default', null, 'teamID', [], {}));
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: { email: 'tore@packers.com' },
          spec: gateSpec,
        }),
      ),
    ).toEqual(
      new ConfigEvaluation(
        true,
        'rule_id_gate',
        'group_name_gate',
        'teamID',
        [],
        {},
      ),
    );
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: { custom: { email: 'tore@nfl.com' } },
          spec: gateSpec,
        }),
      ),
    ).toEqual(
      new ConfigEvaluation(
        true,
        'rule_id_gate',
        'group_name_gate',
        'teamID',
        [],
        {},
      ),
    );
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: { email: 'jkw@seahawks.com' },
          spec: gateSpec,
        }),
      ),
    ).toEqual(new ConfigEvaluation(false, 'default', null, 'teamID', [], {}));
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: { custom: { email: 'tore@packers.com' } },
          spec: disabledGateSpec,
        }),
      ),
    ).toEqual(new ConfigEvaluation(false, 'disabled', null, 'teamID', [], {}));
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: { custom: { email: 'tore@nfl.com' } },
          spec: disabledGateSpec,
        }),
      ),
    ).toEqual(new ConfigEvaluation(false, 'disabled', null, 'teamID', [], {}));
  });

  it('implements pass percentage correctly', () => {
    let passCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (
        mockedEvaluator._eval(
          EvaluationContext.new({
            user: {
              userID: Math.random() + '',
              email: 'tore@packers.com',
            },
            spec: halfPassGateSpec,
          }),
        ).value
      ) {
        passCount++;
      }
    }
    expect(passCount).toBeLessThan(600);
    expect(passCount).toBeGreaterThan(400);
  });

  it('implements pass percentage correctly', () => {
    const valueID1 = mockedEvaluator._eval(
      EvaluationContext.new({
        user: {
          userID: Math.random() + '',
          email: 'tore@packers.com',
          customIDs: { teamID: '3' },
        },
        spec: halfPassGateCustomIDSpec,
      }),
    ).value;
    const valueID2 = mockedEvaluator._eval(
      EvaluationContext.new({
        user: {
          userID: Math.random() + '',
          email: 'tore@packers.com',
          customIDs: { teamid: '2' },
        },
        spec: halfPassGateCustomIDSpec,
      }),
    ).value;
    const valueID3 = mockedEvaluator._eval(
      EvaluationContext.new({
        user: {
          userID: Math.random() + '',
          email: 'tore@packers.com',
          customIDs: { teamId: '3' },
        },
        spec: halfPassGateCustomIDSpec,
      }),
    ).value;
    const valueID4 = mockedEvaluator._eval(
      EvaluationContext.new({
        user: {
          userID: Math.random() + '',
          email: 'tore@packers.com',
          customIDs: { TeamID: '2' },
        },
        spec: halfPassGateCustomIDSpec,
      }),
    ).value;
    expect(valueID1).toEqual(true);
    expect(valueID2).toEqual(false);
    expect(valueID3).toEqual(true);
    expect(valueID4).toEqual(false);
  });

  it('uses the correct return value and ruleID after evaluating pass percentage', () => {
    jest.spyOn(mockedEvaluator, '_evalPassPercent').mockImplementation(() => {
      return false;
    });
    const failResult = mockedEvaluator._eval(
      EvaluationContext.new({
        user: {
          userID: Math.random() + '',
          email: 'tore@packers.com',
        },
        spec: halfPassGateSpec,
      }),
    );

    expect(failResult.rule_id).toEqual(halfPassGateSpec.rules[0].id);
    expect(failResult.value).toEqual(false);

    jest.spyOn(mockedEvaluator, '_evalPassPercent').mockImplementation(() => {
      return true;
    });
    const passResult = mockedEvaluator._eval(
      EvaluationContext.new({
        user: {
          userID: Math.random() + '',
          email: 'tore@packers.com',
        },
        spec: halfPassGateSpec,
      }),
    );

    expect(passResult.rule_id).toEqual(halfPassGateSpec.rules[0].id);
    expect(passResult.group_name).toEqual(halfPassGateSpec.rules[0].groupName);
    expect(passResult.value).toEqual(true);
  });

  it('evals dynamic configs correctly', () => {
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-ignore
          user: {},
          spec: dynamicConfigSpec,
        }),
      ).json_value,
    ).toEqual({});
    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          user: { userID: 'jkw', custom: { level: 10 } },
          spec: dynamicConfigSpec,
        }),
      ).json_value,
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

    let res = mockedEvaluator._eval(
      EvaluationContext.new({
        user: { userID: 'jkw', custom: { level: 10 } },
        spec: dynamicConfigSpec,
      }),
    );
    expect(res.rule_id).toEqual('rule_id_config');
    expect(res.group_name).toEqual('group_name_config');

    expect(
      mockedEvaluator._eval(
        EvaluationContext.new({
          // @ts-expect-error
          user: { level: 5 },
          spec: dynamicConfigSpec,
        }),
      ).json_value,
    ).toEqual({});

    res = mockedEvaluator._eval(
      EvaluationContext.new({
        // @ts-expect-error
        user: { level: 5 },
        spec: dynamicConfigSpec,
      }),
    );
    expect(res.rule_id).toEqual('rule_id_config_public');
    expect(res.group_name).toEqual('group_name_config_public');
  });
});

jest.mock('node-fetch', () => jest.fn());
const jsonResponse = {
  time: Date.now(),
  feature_gates: [exampleConfigSpecs.gate, exampleConfigSpecs.disabled_gate],
  dynamic_configs: [exampleConfigSpecs.config],
  layer_configs: [
    exampleConfigSpecs.allocated_layer,
    exampleConfigSpecs.unallocated_layer,
  ],
  has_updates: true,
};

const fetch = require('node-fetch');
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

describe('testing checkGate and getConfig', () => {
  let evaluator: Evaluator;
  const options = OptionsWithDefaults({});

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    const network = new StatsigFetcher(
      'secret-123',
      options,
      new ErrorBoundary(
        'secret-123',
        OptionsLoggingCopy(options),
        'session-123',
      ),
      'session-123',
    );
    const store = new SpecStore(
      'secret-123',
      network,
      OptionsWithDefaults({ api: 'https://statsigapi.net/v1' }),
    );
    evaluator = new Evaluator(
      OptionsWithDefaults({ api: 'https://statsigapi.net/v1' }),
      store,
    );

    const now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
  });

  test('checkGate() behavior', async () => {
    expect(
      evaluator.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.gate.name,
        StatsigContext.new({}),
      ),
    ).toMatchObject({ value: false });

    await evaluator.init(InitializeContext.new({ sdkKey: 'secret-key' }));
    let result = evaluator.checkGate(
      { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
      exampleConfigSpecs.gate.name,
      StatsigContext.new({}),
    );
    expect(result.value).toEqual(true);
    expect(result.rule_id).toEqual(exampleConfigSpecs.gate.rules[0].id);

    result = evaluator.checkGate(
      { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
      exampleConfigSpecs.gate.name,
      StatsigContext.new({}),
    );
    expect(result.value).toEqual(false);
    expect(result.rule_id).toEqual('default');
    expect(result.group_name).toBeNull();

    expect(
      evaluator.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.gate.name + 'non-existent-gate',
        StatsigContext.new({}),
      ),
    ).toMatchObject({ value: false });
  });

  test('getConfig() behavior', async () => {
    expect(
      evaluator.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.config.name,
        StatsigContext.new({}),
      ),
    ).toMatchObject({ json_value: {} });

    await evaluator.init(InitializeContext.new({ sdkKey: 'secret-key' }));

    // check a config that should evaluate to real return value
    const result = evaluator.getConfig(
      { userID: 'jkw', custom: { email: 'jkw@nfl.com', level: 10 } },
      exampleConfigSpecs.config.name,
      StatsigContext.new({}),
    );
    expect(result.value).toEqual(true);
    expect(result.rule_id).toEqual(exampleConfigSpecs.config.rules[0].id);
    expect(result.group_name).toEqual(
      exampleConfigSpecs.config.rules[0].groupName,
    );
    expect(result.json_value).toEqual(
      exampleConfigSpecs.config.rules[0].returnValue,
    );

    // non-existent config should return {}
    expect(
      evaluator.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.config.name + 'non-existent-config',
        StatsigContext.new({}),
      ),
    ).toMatchObject({ json_value: {} });
  });

  describe('getLayer()', () => {
    it('returns {} when not initialized', () => {
      expect(
        evaluator.getLayer(
          { userID: 'dloomb' },
          'unallocated_layer',
          StatsigContext.new({}),
        ),
      ).toMatchObject({ json_value: {} });
    });

    describe('when initialized', () => {
      beforeEach(async () => {
        await evaluator.init(InitializeContext.new({ sdkKey: 'secret-key' }));
      });

      it('returns {} when a non existant layer name is given', async () => {
        expect(
          evaluator.getLayer(
            { userID: 'dloomb' },
            'not_a_layer',
            StatsigContext.new({}),
          ),
        ).toMatchObject({ json_value: {} });
      });

      it('returns layer defaults', () => {
        const layer = evaluator.getLayer(
          { userID: 'dloomb' },
          'unallocated_layer',
          StatsigContext.new({}),
        );
        expect(layer.json_value).toEqual({ b_param: 'layer_default' });
        expect(layer.rule_id).toEqual('default');
      });
    });
  });

  test('ip2country() behavior', async () => {
    expect(evaluator.ip2country('1.0.0.255')).toEqual(null);
    await evaluator.init(InitializeContext.new({ sdkKey: 'secret-key' }));
    expect(evaluator.ip2country('1.0.0.255')).toEqual('US');
    expect(evaluator.ip2country(16777471)).toEqual('US');
    expect(evaluator.ip2country({})).toEqual(null);
  });
});

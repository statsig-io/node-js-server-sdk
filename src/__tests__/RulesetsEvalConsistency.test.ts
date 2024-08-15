import Evaluator, { ClientInitializeResponse } from '../Evaluator';
import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import safeFetch from '../utils/safeFetch';
import { StatsigContext } from '../utils/StatsigContext';
import StatsigTestUtils from './StatsigTestUtils';

const secret: string = process.env.test_api_key ?? '';
const shouldSkip = typeof secret !== 'string' || secret.length == 0;

if (shouldSkip) {
  fail(
    'THIS TEST IS EXPECTED TO FAIL FOR NON-STATSIG EMPLOYEES! If this is the only test failing, please proceed to submit a pull request. If you are a Statsig employee, chat with jkw.',
  );
}

describe('RulesetsEvalConsistency', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    Statsig.shutdown();
  });

  test.each([['https://statsigapi.net/v1']])('Verify [%s]', async (api) => {
    const response = await safeFetch(api + '/rulesets_e2e_test', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-type': 'application/json; charset=UTF-8',
        'STATSIG-API-KEY': secret,
        'STATSIG-CLIENT-TIME': Date.now() + '',
      },
    });
    const testData = (await response.json()).data;

    const {
      feature_gates_v2: gates,
      dynamic_configs: configs,
      layer_configs: layers,
    } = testData[0];

    const totalChecks =
      testData.length *
      (Object.keys(gates).length +
        Object.keys(configs).length +
        Object.keys(layers).length);

    expect.assertions(totalChecks);

    StatsigInstanceUtils.setInstance(null);
    await Statsig.initialize(secret, { api: api });
    const evaluator: Evaluator = StatsigTestUtils.getEvaluator();

    for (const data of testData) {
      const user = data.user;
      const gates = data.feature_gates_v2;
      const configs = data.dynamic_configs;
      const layers = data.layer_configs;
      const sdkResults = evaluator.getClientInitializeResponse(
        user,
        StatsigContext.new({
          caller: 'getClientInitializeResponse',
          clientKey: undefined,
          hash: 'none',
        }),
        undefined,
        { hash: 'none' },
      );
      if (sdkResults == null) {
        throw new Error('Store has not been set up for test');
      }

      for (const name in gates) {
        const sdkResult = sdkResults['feature_gates'][name];
        const serverResult = gates[name];

        expect([
          name,
          sdkResult.value,
          sdkResult.rule_id,
          sdkResult.secondary_exposures,
        ]).toEqual([
          name,
          serverResult.value,
          serverResult.rule_id,
          serverResult.secondary_exposures,
        ]);
      }

      for (const name in configs) {
        const sdkResult = sdkResults['dynamic_configs'][name];
        const serverResult = configs[name];

        expect([
          name,
          sdkResult.value,
          sdkResult.rule_id,
          sdkResult.secondary_exposures,
        ]).toEqual([
          name,
          serverResult.value,
          serverResult.rule_id,
          serverResult.secondary_exposures,
        ]);
      }

      for (const name in layers) {
        const sdkResult = sdkResults['layer_configs'][name];
        const serverResult = layers[name];

        expect([
          name,
          sdkResult.value,
          sdkResult.rule_id,
          sdkResult.secondary_exposures,
          sdkResult.undelegated_secondary_exposures,
        ]).toEqual([
          name,
          serverResult.value,
          serverResult.rule_id,
          serverResult.secondary_exposures,
          serverResult.undelegated_secondary_exposures,
        ]);
      }
    }
  });
});

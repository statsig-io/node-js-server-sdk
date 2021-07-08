const statsig = require('../index');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

let secret = process.env.test_api_key;
if (!secret) {
  try {
    secret = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../ops/secrets/prod_keys/statsig-rulesets-eval-consistency-test-secret.key',
      ),
      'utf8',
    );
  } catch {}
}

let testData;

if (secret) {
  describe('Verify e2e behavior consistency of Statsig', () => {
    beforeAll(async () => {
      jest.restoreAllMocks();
      jest.resetModules();

      const params = {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-type': 'application/json; charset=UTF-8',
          'STATSIG-API-KEY':
            'secret-9IWfdzNwExEYHEW4YfOQcFZ4xreZyFkbOXHaNbPsMwW',
          'STATSIG-CLIENT-TIME': Date.now(),
        },
      };
      await fetch('http://api.statsig.com/v1/rulesets_e2e_test', params)
        .then((res) => {
          return res.json();
        })
        .then((json) => {
          testData = json.data;
        });
    });

    test('server and SDK evaluates gates to the same results', async () => {
      const totalChecks =
        testData.length *
        (Object.keys(testData[0].feature_gates).length +
          Object.keys(testData[0].dynamic_configs).length);
      expect.assertions(totalChecks);

      await statsig.initialize(secret);
      const promises = testData.map(async (data) => {
        const user = data.user;
        const gates = data.feature_gates;
        const configs = data.dynamic_configs;
        for (const name in gates) {
          const sdkValue = await statsig.checkGate(user, name);
          expect(sdkValue).toEqual(gates[name]);
        }

        for (const name in configs) {
          const sdkValue = await statsig.getConfig(user, name);
          expect(sdkValue.value).toMatchObject(configs[name].value);
        }
      });
      await Promise.all(promises);
    });
  });
} else {
  describe('', () => {
    test('Intended failing test. Proceed with pull request unless you are a Statsig employee.', () => {
      console.log(
        'THIS TEST IS EXPECTED TO FAIL FOR NON-STATSIG EMPLOYEES! If this is the only test failing, please proceed to submit a pull request. If you are a Statsig employee, you need the ops repo.',
      );
      expect(true).toBe(false);
    });
  });
}

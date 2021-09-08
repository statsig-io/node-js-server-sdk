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

if (secret) {
  describe('Verify e2e behavior consistency of Statsig', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      jest.resetModules();
    });

    [
      'https://api.statsig.com/v1',
      'https://us-west-2.api.statsig.com/v1',
      'https://us-east-2.api.statsig.com/v1',
      'https://ap-south-1.api.statsig.com/v1',
      'https://latest.api.statsig.com/v1',
    ].map((url) =>
      test(`server and SDK evaluates gates to the same results on ${url}`, async () => {
        await _validateServerSDKConsistency(url);
      }),
    );
  });
} else {
  describe('', () => {
    test('Intended failing test. Proceed with pull request unless you are a Statsig employee.', () => {
      console.log(
        'THIS TEST IS EXPECTED TO FAIL FOR NON-STATSIG EMPLOYEES! If this is the only test failing, please proceed to submit a pull request. If you are a Statsig employee, chat with jkw.',
      );
      expect(true).toBe(false);
    });
  });
}

async function _validateServerSDKConsistency(api) {
  const response = await fetch(api + '/rulesets_e2e_test', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: {
      'Content-type': 'application/json; charset=UTF-8',
      'STATSIG-API-KEY': secret,
      'STATSIG-CLIENT-TIME': Date.now(),
    },
  });
  const testData = (await response.json()).data;

  const totalChecks =
    testData.length *
    (Object.keys(testData[0].feature_gates).length +
      Object.keys(testData[0].dynamic_configs).length);
  expect.assertions(totalChecks);

  const statsig = require('../index');
  await statsig.initialize(secret, { api: api });

  const promises = testData.map(async (data) => {
    const user = data.user;
    const gates = data.feature_gates;
    const configs = data.dynamic_configs;
    for (const name in gates) {
      const sdkValue = await statsig.checkGate(user, name);
      if (sdkValue !== gates[name]) {
        console.log(
          `Test failed for gate ${name}. Server got ${
            gates[name]
          }, SDK got ${sdkValue} for ${JSON.stringify(user)}`,
        );
      }
      expect(sdkValue).toEqual(gates[name]);
    }

    for (const name in configs) {
      const sdkValue = await statsig.getConfig(user, name);
      expect(sdkValue.value).toMatchObject(configs[name].value);
    }
  });
  await Promise.all(promises);
  console.log(`Successfully completed ${totalChecks} checks for ${api}`);
}

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
  describe('Verify e2e behavior consistency /initialize vs getClientInitializeResponse', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      jest.resetModules();
    });

    ['https://api.statsig.com/v1', 'https://staging.api.statsig.com/v1'].map(
      (url) =>
        test(`server and SDK evaluates gates to the same results on ${url}`, async () => {
          await _validateInitializeConsistency(url);
        }),
    );
  });
} else {
  describe('fail for non employees', () => {
    test('Intended failing test. Proceed with pull request unless you are a Statsig employee.', () => {
      console.log(
        'THIS TEST IS EXPECTED TO FAIL FOR NON-STATSIG EMPLOYEES! If this is the only test failing, please proceed to submit a pull request. If you are a Statsig employee, chat with jkw.',
      );
      expect(true).toBe(false);
    });
  });
}

async function _validateInitializeConsistency(api) {
  expect.assertions(1);
  const user = {
    userID: '12345',
    email: 'test@statsig.com',
    country: 'US',
    custom: {
      test: '123',
    },
  };
  const response = await fetch(api + '/initialize', {
    method: 'POST',
    body: JSON.stringify({
      user: user,
      statsigMetadata: {
        sdkType: 'consistency-test',
        sessionID: 'x123',
      },
    }),
    headers: {
      'Content-type': 'application/json; charset=UTF-8',
      'STATSIG-API-KEY': 'client-wlH3WMkysINMhMU8VrNBkbjrEr2JQrqgxKwDPOUosJK',
      'STATSIG-CLIENT-TIME': Date.now(),
    },
  });
  const testData = await response.json();
  // for sake of comparison, normalize the initialize response
  // drop unused fields, set the time to 0
  testData.time = 0;

  for (const topLevel in testData) {
    for (const property in testData[topLevel]) {
      const item = testData[topLevel][property];
      if (item.secondary_exposures) {
        item.secondary_exposures.map((item) => {
          delete item.gate;
        });
        item.undelegated_secondary_exposures?.map((item) => {
          delete item.gate;
        });
      }
      // // TODO for full layers future proofing
      // delete item['explicit_parameters'];
      delete item['is_in_layer'];
    }
  }

  const statsig = require('../../dist/src/index');
  await statsig.initialize(secret, { api: api });

  const sdkInitializeResponse = statsig.getClientInitializeResponse(user);

  for (const topLevel in sdkInitializeResponse) {
    for (const property in sdkInitializeResponse[topLevel]) {
      const item = sdkInitializeResponse[topLevel][property];
      if (item.secondary_exposures) {
        // initialize has these hashed, we are putting them in plain text
        // exposure logging still works
        item.secondary_exposures.map((item) => {
          delete item.gate;
        });
      }
    }
  }
  expect(sdkInitializeResponse).toEqual(testData);
}

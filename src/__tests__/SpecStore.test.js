describe('Verify behavior of SpecStore', () => {
  const exampleConfigSpecs = require('./jest.setup');
  const { ConfigSpec } = require('../ConfigSpec');
  const { DynamicConfig } = require('../DynamicConfig');

  let SpecStore;
  let fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    SpecStore = require('../SpecStore');
    fetch = require('node-fetch');
    jest.mock('node-fetch', () => jest.fn());
    fetch.mockImplementation((url) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              time: Date.now(),
              feature_gates: [
                exampleConfigSpecs.gate,
                exampleConfigSpecs.disabled_gate,
              ],
              dynamic_configs: [exampleConfigSpecs.config],
              has_updates: true,
            }),
        });
      }
      return Promise.reject();
    });

    let now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
  });

  test('init() does things correctly and kicks off a sync() which gets updated values', async () => {
    await SpecStore.init({}, 'secret-api-key', 1000);
    expect(Object.keys(SpecStore.store.gates).length).toEqual(2);
    expect(Object.keys(SpecStore.store.configs).length).toEqual(1);
    expect(SpecStore.store.gates[exampleConfigSpecs.gate.name]).toEqual(
      new ConfigSpec(exampleConfigSpecs.gate)
    );
    expect(
      SpecStore.store.gates[exampleConfigSpecs.disabled_gate.name]
    ).toEqual(new ConfigSpec(exampleConfigSpecs.disabled_gate));
    expect(SpecStore.store.configs[exampleConfigSpecs.config.name]).toEqual(
      new ConfigSpec(exampleConfigSpecs.config)
    );
    expect(SpecStore.time).toEqual(Date.now());
    expect(SpecStore.initialized).toEqual(true);
    expect(SpecStore.syncTimer).toBeTruthy();

    // first sync gives updated values
    let modifiedGate = JSON.parse(JSON.stringify(exampleConfigSpecs.gate));
    modifiedGate.enabled = false;
    const timeAfterFirstSync = Date.now() + 1000;

    fetch.mockImplementationOnce((url) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              time: timeAfterFirstSync,
              feature_gates: [
                modifiedGate,
                exampleConfigSpecs.disabled_gate,
                exampleConfigSpecs.half_pass_gate,
              ],
              dynamic_configs: [exampleConfigSpecs.config],
              has_updates: true,
            }),
        });
      }
      return Promise.reject();
    });
    await new Promise((_) => setTimeout(_, 1001));

    const storeAfterFirstSync = Object.assign(SpecStore.store);

    expect(Object.keys(SpecStore.store.gates).length).toEqual(3);
    expect(Object.keys(SpecStore.store.configs).length).toEqual(1);
    expect(SpecStore.store.gates[exampleConfigSpecs.gate.name]).toEqual(
      new ConfigSpec(modifiedGate)
    );
    expect(
      SpecStore.store.gates[exampleConfigSpecs.disabled_gate.name]
    ).toEqual(new ConfigSpec(exampleConfigSpecs.disabled_gate));
    expect(
      SpecStore.store.gates[exampleConfigSpecs.half_pass_gate.name]
    ).toEqual(new ConfigSpec(exampleConfigSpecs.half_pass_gate));
    expect(SpecStore.store.configs[exampleConfigSpecs.config.name]).toEqual(
      new ConfigSpec(exampleConfigSpecs.config)
    );
    expect(SpecStore.time).toEqual(timeAfterFirstSync);
    expect(SpecStore.initialized).toEqual(true);
    expect(SpecStore.syncTimer).toBeTruthy();

    // second sync gives no updates
    fetch.mockImplementationOnce((url) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              has_updates: false,
            }),
        });
      }
      return Promise.reject();
    });
    await new Promise((_) => setTimeout(_, 1001));
    expect(storeAfterFirstSync).toEqual(SpecStore.store);
    expect(SpecStore.time).toEqual(timeAfterFirstSync);

    SpecStore.shutdown();
    expect(SpecStore.syncTimer).toBeNull();
  });

  test('checkGate() behavior', async () => {
    // calling before initialize should return null
    expect(
      SpecStore.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.gate.name
      )
    ).toEqual(null);

    await SpecStore.init({}, 'secret-api-key', 1000);
    // check a gate that should evaluate to true
    expect(
      SpecStore.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.gate.name
      )
    ).toEqual({ value: true, rule_id: exampleConfigSpecs.gate.rules[0].id });

    // should evaluate to false
    expect(
      SpecStore.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.gate.name
      )
    ).toEqual({ value: false, rule_id: 'default' });

    // non-existent gate should return null
    expect(
      SpecStore.checkGate(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.gate.name + 'non-existent-gate'
      )
    ).toEqual(null);
  });

  test('getConfig() behavior', async () => {
    // calling before initialize should return null
    expect(
      SpecStore.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@nfl.com' } },
        exampleConfigSpecs.config.name
      )
    ).toEqual(null);

    await SpecStore.init({}, 'secret-api-key');

    // check a config that should evaluate to real return value
    expect(
      SpecStore.getConfig(
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
      SpecStore.getConfig(
        { userID: 'jkw', custom: { email: 'jkw@gmail.com' } },
        exampleConfigSpecs.config.name + 'non-existent-config'
      )
    ).toEqual(null);
  });

  test('ip2country() behavior', async () => {
    expect(SpecStore.ip2country('1.0.0.255')).toEqual(null);
    await SpecStore.init({}, 'secret-api-key');
    expect(SpecStore.ip2country('1.0.0.255')).toEqual('US');
    expect(SpecStore.ip2country(16777471)).toEqual('US');
    expect(SpecStore.ip2country({})).toEqual(null);
  });
});

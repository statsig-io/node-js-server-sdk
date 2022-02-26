describe('Verify behavior of SpecStore', () => {
  const exampleConfigSpecs = require('./jest.setup');
  const { ConfigSpec } = require('../ConfigSpec');

  let SpecStore;
  let fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    SpecStore = require('../SpecStore');
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
    fetch.mockImplementation((url, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(jsonResponse),
          text: () => Promise.resolve(JSON.stringify(jsonResponse)),
        });
      }
      if (url.includes('get_id_lists')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              list_1: {
                name: 'list_1',
                size: 15,
                url: 'https://id_list_content/list_1',
              },
            }),
        });
      }
      if (url.includes('id_list_content')) {
        let wholeList = '';
        for (var i = 1; i <= 5; i++) {
          wholeList += `+${i}\n`;
        }
        const startingIndex = parseInt(
          /\=(.*)\-/.exec(params['headers']['Range'])[1],
        );
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wholeList.slice(startingIndex)),
          headers: {
            'Content-Length': 15 - startingIndex,
          },
        });
      }
      return Promise.reject();
    });

    let now = Date.now();
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
  });

  test('init() does things correctly and kicks off a sync() which gets updated values', async () => {
    await SpecStore.init({}, 'secret-api-key', 1000, 1000);
    expect(Object.keys(SpecStore.store.gates).length).toEqual(2);
    expect(Object.keys(SpecStore.store.configs).length).toEqual(1);
    expect(SpecStore.store.gates[exampleConfigSpecs.gate.name]).toEqual(
      new ConfigSpec(exampleConfigSpecs.gate),
    );
    expect(
      SpecStore.store.gates[exampleConfigSpecs.disabled_gate.name],
    ).toEqual(new ConfigSpec(exampleConfigSpecs.disabled_gate));
    expect(SpecStore.store.configs[exampleConfigSpecs.config.name]).toEqual(
      new ConfigSpec(exampleConfigSpecs.config),
    );
    expect(SpecStore.store.idLists).toEqual(
      expect.objectContaining({
        list_1: {
          ids: { 1: true, 2: true, 3: true, 4: true, 5: true },
          readBytes: 15,
          url: 'https://id_list_content/list_1',
        },
      }),
    );
    const now = Date.now();
    expect(SpecStore.time).toBeLessThanOrEqual(now);
    expect(SpecStore.time).toBeGreaterThanOrEqual(now - 1);
    expect(SpecStore.initialized).toEqual(true);
    expect(SpecStore.syncTimer).toBeTruthy();

    // first sync gives updated values
    let modifiedGate = JSON.parse(JSON.stringify(exampleConfigSpecs.gate));
    modifiedGate.enabled = false;
    const timeAfterFirstSync = Date.now() + 1000;

    const updatedJSONResponse = {
      time: timeAfterFirstSync,
      feature_gates: [
        modifiedGate,
        exampleConfigSpecs.disabled_gate,
        exampleConfigSpecs.half_pass_gate,
      ],
      dynamic_configs: [exampleConfigSpecs.config],
      id_lists: { list_1: true, list_2: true },
      has_updates: true,
    };

    fetch.mockImplementation((url, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(updatedJSONResponse),
          text: () => Promise.resolve(JSON.stringify(updatedJSONResponse)),
        });
      }
      if (url.includes('get_id_lists')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              list_1: {
                name: 'list_1',
                size: 24,
                url: 'https://id_list_content/list_1',
              },
            }),
        });
      }
      if (url.includes('id_list_content')) {
        let wholeList = '';
        for (var i = 1; i <= 5; i++) {
          wholeList += `+${i}\n`;
        }
        for (var i = 1; i <= 3; i++) {
          wholeList += `-${i}\n`;
        }
        const startingIndex = parseInt(
          /\=(.*)\-/.exec(params['headers']['Range'])[1],
        );
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wholeList.slice(startingIndex)),
          headers: {
            'Content-Length': 24 - startingIndex,
          },
        });
      }
      return Promise.reject();
    });
    await new Promise((_) => setTimeout(_, 1100));

    const storeAfterFirstSync = Object.assign(SpecStore.store);

    expect(Object.keys(SpecStore.store.gates).length).toEqual(3);
    expect(Object.keys(SpecStore.store.configs).length).toEqual(1);
    expect(SpecStore.store.gates[exampleConfigSpecs.gate.name]).toEqual(
      new ConfigSpec(modifiedGate),
    );
    expect(
      SpecStore.store.gates[exampleConfigSpecs.disabled_gate.name],
    ).toEqual(new ConfigSpec(exampleConfigSpecs.disabled_gate));
    expect(
      SpecStore.store.gates[exampleConfigSpecs.half_pass_gate.name],
    ).toEqual(new ConfigSpec(exampleConfigSpecs.half_pass_gate));
    expect(SpecStore.store.configs[exampleConfigSpecs.config.name]).toEqual(
      new ConfigSpec(exampleConfigSpecs.config),
    );
    expect(SpecStore.store.idLists).toEqual(
      expect.objectContaining({
        list_1: {
          ids: { 4: true, 5: true }, // 1,2,3, should be deleted
          readBytes: 24,
          url: 'https://id_list_content/list_1',
        },
      }),
    );
    expect(SpecStore.time).toEqual(timeAfterFirstSync);
    expect(SpecStore.initialized).toEqual(true);
    expect(SpecStore.syncTimer).toBeTruthy();

    // second sync gives no updates to rulesets, but changes the url for id list
    fetch.mockImplementation((url, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              has_updates: false,
            }),
        });
      }
      if (url.includes('get_id_lists')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              list_1: {
                name: 'list_1',
                size: 15,
                url: 'https://id_list_content/list_1_2',
              },
            }),
        });
      }
      if (url.includes('id_list_content')) {
        let wholeList = '';
        for (var i = 1; i <= 5; i++) {
          wholeList += `+${i}\n`;
        }
        const startingIndex = parseInt(
          /\=(.*)\-/.exec(params['headers']['Range'])[1],
        );
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(wholeList.slice(startingIndex)),
          headers: {
            'Content-Length': 15,
          },
        });
      }
      return Promise.reject();
    });
    await new Promise((_) => setTimeout(_, 1001));
    expect(storeAfterFirstSync).toEqual(SpecStore.store);
    expect(SpecStore.time).toEqual(timeAfterFirstSync);
    expect(SpecStore.store.idLists).toEqual(
      expect.objectContaining({
        list_1: {
          ids: { 1: true, 2: true, 3: true, 4: true, 5: true },
          readBytes: 15,
          url: 'https://id_list_content/list_1_2',
        },
      }),
    );

    SpecStore.shutdown();
    expect(SpecStore.syncTimer).toBeNull();
  });
});

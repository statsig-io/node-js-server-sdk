import { MAX_SAMPLING_RATE } from '../Diagnostics';
import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import exampleConfigSpecs from './jest.setup';
import StatsigTestUtils, { assertMarkerEqual } from './StatsigTestUtils';

jest.mock('node-fetch', () => jest.fn());

const jsonResponse = {
  time: Date.now(),
  feature_gates: [exampleConfigSpecs.gate, exampleConfigSpecs.disabled_gate],
  dynamic_configs: [exampleConfigSpecs.config],
  layer_configs: [exampleConfigSpecs.allocated_layer],
  has_updates: true,
  diagnostics: {
    dcs: MAX_SAMPLING_RATE,
    log: MAX_SAMPLING_RATE,
    idlist: MAX_SAMPLING_RATE,
    initialize: MAX_SAMPLING_RATE,
  },
};

describe('ConfigSyncDiagnostics', () => {
  let events: {
    eventName: string;
    metadata: { gate?: string; config?: string; isManualExposure?: string };
  }[] = [];

  let getIDListJSON;
  let getIDListResponse;
  let downloadConfigSpecsResponse;
  const fetch = require('node-fetch');

  fetch.mockImplementation((url: string, params) => {
    if (url.includes('download_config_specs')) {
      return Promise.resolve(downloadConfigSpecsResponse);
    }

    if (url.includes('get_id_lists')) {
      return Promise.resolve(getIDListResponse);
    }

    if (url.includes('log_event')) {
      events = events.concat(JSON.parse(params.body)['events']);
      return Promise.resolve({
        ok: true,
      });
    }

    if (url.includes('id_list_content')) {
      let wholeList = '';
      for (let i = 1; i <= 5; i++) {
        wholeList += `+${i}\n`;
      }
      const startingIndex = parseInt(
        // @ts-ignore
        /\=(.*)\-/.exec(params['headers']['Range'])[1],
      );
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(wholeList.slice(startingIndex)),
        headers: {
          get: jest.fn((v) => {
            if (v.toLowerCase() === 'content-length') {
              return 15 - startingIndex;
            }
          }),
        },
      });
    }

    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve('{}'),
    });
  });

  beforeEach(async () => {
    getIDListJSON = {};
    getIDListResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(getIDListJSON),
    };
    downloadConfigSpecsResponse = {
      ok: true,
      json: () => Promise.resolve(jsonResponse),
      text: () => Promise.resolve(JSON.stringify(jsonResponse)),
      status: 200,
    };

    events = [];
    // @ts-ignore
    StatsigInstanceUtils.setInstance(null);
  });

  it.each([true, false])(
    'test config download, disableDiagnostics: %s',
    async (disableDiagnostics) => {
      await Statsig.initialize('secret-key', {
        loggingMaxBufferSize: 1,
        rulesetsSyncIntervalMs: 100,
        disableDiagnostics: disableDiagnostics,
      });
      await runSync('getConfigSpecs');
      Statsig.shutdown();
      events = events.filter((e) => e['metadata']['context'] !== 'initialize');

      if (disableDiagnostics) {
        expect(events.length).toBe(0);
        return;
      }

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event['eventName']).toBe('statsig::diagnostics');

      const metadata = event['metadata'];
      expect(metadata['context']).toBe('config_sync');

      const markers = metadata['markers'];
      assertMarkerEqual(markers[0], 'download_config_specs', 'start', {
        step: 'network_request',
      });
      assertMarkerEqual(markers[1], 'download_config_specs', 'end', {
        step: 'network_request',
        value: 200,
      });
      assertMarkerEqual(markers[2], 'download_config_specs', 'start', {
        step: 'process',
      });
      assertMarkerEqual(markers[3], 'download_config_specs', 'end', {
        step: 'process',
        value: true,
      });
      expect(markers.length).toBe(4);
    },
  );

  it('test config download failure', async () => {
    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1,
      rulesetsSyncIntervalMs: 100,
    });

    downloadConfigSpecsResponse = {
      ok: false,
      status: 500,
    };
    await StatsigTestUtils.getEvaluator()['store']._syncValues();

    Statsig.shutdown();

    events = events.filter((e) => e['metadata']['context'] !== 'initialize');
    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('config_sync');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], 'download_config_specs', 'start', {
      step: 'network_request',
    });
    assertMarkerEqual(markers[1], 'download_config_specs', 'end', {
      step: 'network_request',
      value: 500,
    });
    expect(markers.length).toBe(2);
  });

  it('test get_id_list_source failure', async () => {
    getIDListResponse = {
      ok: false,
      status: 500,
    };

    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1,
      idListsSyncIntervalMs: 100,
    });

    await runSync('getIDList');
    Statsig.shutdown();
    events = events.filter((e) => e['metadata']['context'] !== 'initialize');
    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('config_sync');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], 'get_id_list_sources', 'start', {
      step: 'network_request',
    });
    assertMarkerEqual(markers[1], 'get_id_list_sources', 'end', {
      step: 'network_request',
      value: 500,
    });

    expect(markers.length).toBe(2);
  });

  it.each([true, false])(
    'test get_id_list download, disableDiagnostics: %s',
    async (disableDiagnostics) => {
      await Statsig.initialize('secret-key', {
        loggingMaxBufferSize: 1,
        idListsSyncIntervalMs: 100,
        disableDiagnostics: disableDiagnostics,
      });

      getIDListJSON = {
        list_1: {
          name: 'list_1',
          size: 15,
          url: 'https://id_list_content/list_1',
          fileID: 'file_id_1',
          creationTime: 2,
        },
        list_2: {
          name: 'list_2',
          size: 20,
          url: 'https://id_list_content/list_2',
          fileID: 'file_id_2',
          creationTime: 2,
        },
      };

      await runSync('getIDList');
      Statsig.shutdown();
      events = events.filter((e) => e['metadata']['context'] !== 'initialize');

      if (disableDiagnostics) {
        expect(events.length).toBe(0);
        return;
      }

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event['eventName']).toBe('statsig::diagnostics');

      const metadata = event['metadata'];
      expect(metadata['context']).toBe('config_sync');

      const markers = metadata['markers'];
      assertMarkerEqual(markers[0], 'get_id_list_sources', 'start', {
        step: 'network_request',
      });
      assertMarkerEqual(markers[1], 'get_id_list_sources', 'end', {
        step: 'network_request',
        value: 200,
      });

      assertMarkerEqual(markers[2], 'get_id_list_sources', 'start', {
        step: 'process',
      });
      assertMarkerEqual(markers[3], 'get_id_list_sources', 'end', {
        step: 'process',
      });

      assertMarkerEqual(markers[4], 'get_id_list', 'start', {
        step: 'network_request',
        metadata: { url: 'https://id_list_content/list_1' },
      });
      assertMarkerEqual(markers[5], 'get_id_list', 'start', {
        step: 'network_request',
        metadata: { url: 'https://id_list_content/list_2' },
      });
      assertMarkerEqual(markers[6], 'get_id_list', 'end', {
        step: 'network_request',
        metadata: { url: 'https://id_list_content/list_1' },
      });
      assertMarkerEqual(markers[7], 'get_id_list', 'start', {
        step: 'process',
        metadata: { url: 'https://id_list_content/list_1' },
      });
      assertMarkerEqual(markers[8], 'get_id_list', 'end', {
        step: 'network_request',
        metadata: { url: 'https://id_list_content/list_2' },
      });
      assertMarkerEqual(markers[9], 'get_id_list', 'start', {
        step: 'process',
        metadata: { url: 'https://id_list_content/list_2' },
      });

      assertMarkerEqual(markers[10], 'get_id_list', 'end', {
        step: 'process',
        value: true,
        metadata: { url: 'https://id_list_content/list_1' },
      });
      assertMarkerEqual(markers[11], 'get_id_list', 'end', {
        step: 'process',
        value: true,
        metadata: { url: 'https://id_list_content/list_2' },
      });

      expect(markers.length).toBe(12);
    },
  );
});

// @ts-ignore
const statsig = Statsig.default;

async function runSync(type: 'getIDList' | 'getConfigSpecs') {
  const evaluator = StatsigTestUtils.getEvaluator();

  const now = Date.now();

  let gate = await statsig.checkGateWithExposureLoggingDisabled(
    { userID: '123', email: 'tore@packers.com' },
    'nfl_gate',
  );
  expect(gate).toBe(true);

  jest
    .spyOn(global.Date, 'now')
    .mockImplementation(() => now + (2 * 60 * 1000 - 100));
  gate = await statsig.checkGateWithExposureLoggingDisabled(
    { userID: '123', email: 'tore@packers.com' },
    'nfl_gate',
  );
  expect(gate).toBe(true);

  // check diagnostitics last sync time didn't change
  if (type === 'getConfigSpecs') {
    await evaluator['store']._syncValues();
  }
  if (type === 'getIDList') {
    await evaluator['store']._syncIdLists();
  }
  jest
    .spyOn(global.Date, 'now')
    .mockImplementation(() => now + (2 * 60 * 1000 + 1));
  await new Promise((resolve) => setTimeout(resolve, 1000));

  gate = await statsig.checkGateWithExposureLoggingDisabled(
    { userID: '123', email: 'tore@packers.com' },
    'nfl_gate',
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));

  expect(gate).toBe(true);
}

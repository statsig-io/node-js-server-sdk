import { FetchError } from 'node-fetch';

import { MAX_SAMPLING_RATE } from '../Diagnostics';
import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import exampleConfigSpecs from './jest.setup';
import StatsigTestUtils, { assertMarkerEqual, getDecodedBody } from './StatsigTestUtils';

jest.mock('../utils/safeFetch', () => jest.fn());

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
  let throwDCSError;
  const fetch = require('../utils/safeFetch');

  fetch.mockImplementation((url: string, params) => {
    if (url.includes('download_config_specs')) {
      if(throwDCSError) {
        return Promise.reject(throwDCSError);
      }
      return Promise.resolve(downloadConfigSpecsResponse);
    }

    if (url.includes('get_id_lists')) {
      return Promise.resolve(getIDListResponse);
    }

    if (url.includes('log_event')) {
      events = events.concat(getDecodedBody(params)['events']);
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
        /=(.*)-/.exec(params['headers']['Range'])[1],
      );
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(wholeList.slice(startingIndex)),
        status: 200,
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
    throwDCSError = null;

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

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event['eventName']).toBe('statsig::diagnostics');

      const metadata = event['metadata'];
      expect(metadata['context']).toBe('config_sync');

      const markers = metadata['markers'];
      assertMarkerEqual(markers[0], {
        key: 'download_config_specs',
        action: 'start',
        step: 'network_request',
      });
      assertMarkerEqual(markers[1], {
        key: 'download_config_specs',
        action: 'end',
        step: 'network_request',
        statusCode: 200,
        success: true,
      });
      assertMarkerEqual(markers[2], {
        key: 'download_config_specs',
        action: 'start',
        step: 'process',
      });
      assertMarkerEqual(markers[3], {
        key: 'download_config_specs',
        action: 'end',
        step: 'process',
        success: true,
      });
      
      expect(markers.length).toBe(4);
    },
  );

  it.each([
    {
      setupFailureCase: () => {
        downloadConfigSpecsResponse = {
          ok: false,
          status: 500,
        };
      },
      expectedMarkers: [
        {
          key: 'download_config_specs',
          action: 'start',
          step: 'network_request',
        },
        {
          key: 'download_config_specs',
          action: 'end',
          step: 'network_request',
          statusCode: 500,
          error: {
            name: expect.any(String),
            message: expect.any(String),
          },
          success: false,
        }
      ]
    }, {
      setupFailureCase: () => {
        throwDCSError = new FetchError('test error', 'ECONNREFUSED');
        throwDCSError.code = 'ECONNREFUSED';
      },
      expectedMarkers: [
        {
          key: 'download_config_specs',
          action: 'start',
          step: 'network_request',
        },
        {
          key: 'download_config_specs',
          action: 'end',
          step: 'network_request',
          error: {
            name: expect.any(String),
            code: expect.any(String),
            message: expect.any(String),
          },
          success: false,
        }
      ],
    }
  ])('test config download failure', async ({setupFailureCase, expectedMarkers}) => {
    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1,
      rulesetsSyncIntervalMs: 100,
    });

    setupFailureCase();
    await StatsigTestUtils.getEvaluator()['store'].syncConfigSpecs();

    Statsig.shutdown();

    events = events.filter((e) => e['metadata']['context'] !== 'initialize');
    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('config_sync');

    const markers = metadata['markers'];
    expectedMarkers.forEach((expectedMarker, i) => {
      assertMarkerEqual(markers[i], expectedMarker);
    });
    
    expect(markers.length).toBe(expectedMarkers.length);
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
    assertMarkerEqual(markers[0], {
      key: 'get_id_list_sources',
      action: 'start',
      step: 'network_request',
    });
    assertMarkerEqual(markers[1], {
      key: 'get_id_list_sources',
      action: 'end',
      step: 'network_request',
      statusCode: 500,
      error: {
        name: expect.any(String),
        message: expect.any(String),
      },
      success: false,
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
      // Disable diagnostics only disable api_call, so not affecting config_sync
      expect(events.length).toBe(1);
      const event = events[0];
      expect(event['eventName']).toBe('statsig::diagnostics');

      const metadata = event['metadata'];
      expect(metadata['context']).toBe('config_sync');

      const markers = metadata['markers'];
      assertMarkerEqual(markers[0], {
        key: 'get_id_list_sources',
        action: 'start',
        step: 'network_request',
      });
      assertMarkerEqual(markers[1], {
        key: 'get_id_list_sources',
        action: 'end',
        step: 'network_request',
        statusCode: 200,
        success: true,
      });
      
      assertMarkerEqual(markers[2], {
        key: 'get_id_list_sources',
        action: 'start',
        step: 'process',
        idListCount: 2,
      });
      assertMarkerEqual(markers[3], {
        key: 'get_id_list',
        action: 'start',
        step: 'network_request',
        url: 'https://id_list_content/list_1',
        markerID: "1"
      });
      assertMarkerEqual(markers[4], {
        key: 'get_id_list',
        action: 'end',
        step: 'network_request',
        statusCode: 200,
        success: true,
        markerID: "1"
      });
      assertMarkerEqual(markers[5], {
        key: 'get_id_list',
        action: 'start',
        step: 'process',
        markerID: "1"
      });
      assertMarkerEqual(markers[6], {
        key: 'get_id_list',
        action: 'end',
        step: 'process',
        success: true,
        markerID: "1"
      });
      assertMarkerEqual(markers[7], {
        key: 'get_id_list_sources',
        action: 'end',
        step: 'process',
        success: true,
      });
      

      expect(markers.length).toBe(8);
    },
  );
});

// @ts-ignore
const statsig = Statsig.default;

async function runSync(type: 'getIDList' | 'getConfigSpecs') {
  const evaluator = StatsigTestUtils.getEvaluator();
  if (type === 'getConfigSpecs') {
    await evaluator['store'].syncConfigSpecs();
  }
  if (type === 'getIDList') {
    await evaluator['store'].syncIdLists();
  }
}

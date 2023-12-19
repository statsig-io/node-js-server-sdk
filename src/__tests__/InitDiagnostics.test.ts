// ID list
// network init success
// network init failure
// bootstrap init
// dataadapter init

import Statsig from '../index';
import { DataAdapterKey } from '../interfaces/IDataAdapter';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { GatesForIdListTest } from './BootstrapWithDataAdapter.data';
import exampleConfigSpecs from './jest.setup';
import { assertMarkerEqual, getDecodedBody } from './StatsigTestUtils';
import { TestSyncingDataAdapter } from './TestDataAdapter';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/exposure_logging_dcs.json'),
);

describe('InitDiagnostics', () => {
  let events: {
    eventName: string;
    metadata: { gate?: string; config?: string; isManualExposure?: string };
  }[] = [];

  let getIDListJSON;
  let downloadConfigSpecsResponse;

  beforeEach(async () => {
    getIDListJSON = {};
    downloadConfigSpecsResponse = Promise.resolve({
      ok: true,
      text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
      status: 200,
    });
    const fetch = require('node-fetch');

    fetch.mockImplementation((url: string, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve(downloadConfigSpecsResponse);
      }

      if (url.includes('get_id_lists')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(getIDListJSON),
        });
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
          status: 200,
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

    events = [];
    // @ts-ignore
    StatsigInstanceUtils.setInstance(null);
  });

  // Always initialization data even when diagnostics disabled
  it.each([true, false])(
    'test network init success',
    async (disableDiagnostics) => {
      await Statsig.initialize('secret-key', {
        loggingMaxBufferSize: 1,
        disableDiagnostics,
      });
      
      Statsig.shutdown();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event['eventName']).toBe('statsig::diagnostics');

      const metadata = event['metadata'];
      expect(metadata).not.toBeNull();
      expect(metadata['context']).toBe('initialize');

      const markers = metadata['markers'];
      assertMarkerEqual(markers[0], {
        key: 'overall',
        action: 'start',
      });
      assertMarkerEqual(markers[1], {
        key: 'download_config_specs',
        action: 'start',
        step: 'network_request',
      });
      assertMarkerEqual(markers[2], {
        key: 'download_config_specs',
        action: 'end',
        step: 'network_request',
        statusCode: 200,
        success: true,
      });
      assertMarkerEqual(markers[3], {
        key: 'download_config_specs',
        action: 'start',
        step: 'process',
      });
      assertMarkerEqual(markers[4], {
        key: 'download_config_specs',
        action: 'end',
        step: 'process',
        success: true,
      });
      assertMarkerEqual(markers[5], {
        key: 'get_id_list_sources',
        action: 'start',
        step: 'network_request',
      });
      assertMarkerEqual(markers[6], {
        key: 'get_id_list_sources',
        action: 'end',
        step: 'network_request',
        statusCode: 200,
        success: true,
      });
      assertMarkerEqual(markers[7], {
        key: 'get_id_list_sources',
        action: 'start',
        step: 'process',
        idListCount: 0,
      });
      assertMarkerEqual(markers[8], {
        key: 'get_id_list_sources',
        action: 'end',
        step: 'process',
        success: true,
      });
      assertMarkerEqual(markers[9], {
        key: 'overall',
        action: 'end',
        success: true,
      });
      
      expect(markers.length).toBe(10);
    },
  );

  it('test network init failure', async () => {
    downloadConfigSpecsResponse = {
      status: 500,
      ok: false,
      json: () => Promise.resolve({}),
    };
    await Statsig.initialize('secret-key', { loggingMaxBufferSize: 1 });

    Statsig.shutdown();

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata).not.toBeNull();
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], {
      key: 'overall',
      action: 'start',
    });
    assertMarkerEqual(markers[1], {
      key: 'download_config_specs',
      action: 'start',
      step: 'network_request',
    });
    assertMarkerEqual(markers[2], {
      key: 'download_config_specs',
      action: 'end',
      step: 'network_request',
      statusCode: 500,
      error: {
        name: expect.any(String),
        message: expect.any(String)
      },
      success: false,
    });
    assertMarkerEqual(markers[3], {
      key: 'get_id_list_sources',
      action: 'start',
      step: 'network_request',
    });
    assertMarkerEqual(markers[4], {
      key: 'get_id_list_sources',
      action: 'end',
      step: 'network_request',
      statusCode: 200,
      success: true,
    });
    assertMarkerEqual(markers[5], {
      key: 'get_id_list_sources',
      action: 'start',
      step: 'process',
      idListCount: 0,
    });
    assertMarkerEqual(markers[6], {
      key: 'get_id_list_sources',
      action: 'end',
      step: 'process',
      success: true,
    });
    assertMarkerEqual(markers[7], {
      key: 'overall',
      action: 'end',
      success: true,
    });
    
    expect(markers.length).toBe(8);
  });

  it('test get_id_list init', async () => {
    getIDListJSON = {
      list_1: {
        name: 'list_1',
        size: 15,
        url: 'https://id_list_content/list_1',
        fileID: 'file_id_1',
        creationTime: 1,
      },
    };

    await Statsig.initialize('secret-key', { loggingMaxBufferSize: 1 });

    Statsig.shutdown();

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], {
      key: 'overall',
      action: 'start',
    });
    // Skip download config specs
    assertMarkerEqual(markers[5], {
      key: 'get_id_list_sources',
      action: 'start',
      step: 'network_request',
    });
    assertMarkerEqual(markers[6], {
      key: 'get_id_list_sources',
      action: 'end',
      step: 'network_request',
      statusCode: 200,
      success: true,
    });
    assertMarkerEqual(markers[7], {
      key: 'get_id_list_sources',
      action: 'start',
      step: 'process',
      idListCount: 1,
    });
    assertMarkerEqual(markers[8], {
      key: 'get_id_list',
      action: 'start',
      step: 'network_request',
      url: 'https://id_list_content/list_1',
    });
    assertMarkerEqual(markers[9], {
      key: 'get_id_list',
      action: 'end',
      step: 'network_request',
      statusCode: 200,
      success: true,
      url: 'https://id_list_content/list_1',
    });
    assertMarkerEqual(markers[10], {
      key: 'get_id_list',
      action: 'start',
      step: 'process',
      url: 'https://id_list_content/list_1',
    });
    assertMarkerEqual(markers[11], {
      key: 'get_id_list',
      action: 'end',
      step: 'process',
      success: true,
      url: 'https://id_list_content/list_1',
    });
    assertMarkerEqual(markers[12], {
      key: 'get_id_list_sources',
      action: 'end',
      step: 'process',
      success: true,
    });
    assertMarkerEqual(markers[13], {
      key: 'overall',
      action: 'end',
      success: true,
    });
    
    expect(markers.length).toBe(14);
  });

  it('test bootstrap config specs init', async () => {
    const jsonResponse = {
      time: Date.now(),
      feature_gates: [
        exampleConfigSpecs.gate,
        exampleConfigSpecs.disabled_gate,
      ],
      dynamic_configs: [exampleConfigSpecs.config],
      layer_configs: [],
      has_updates: true,
    };

    await Statsig.initialize('secret-key', {
      bootstrapValues: JSON.stringify(jsonResponse),
      loggingMaxBufferSize: 1,
    });
    Statsig.shutdown();

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata).not.toBeNull();
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], {
      key: 'overall',
      action: 'start',
    });
    assertMarkerEqual(markers[1], {
      key: 'bootstrap',
      action: 'start',
      step: 'process',
    });
    assertMarkerEqual(markers[2], {
      key: 'bootstrap',
      action: 'end',
      step: 'process',
      success: true,
    });
    assertMarkerEqual(markers[markers.length - 1], {
      key: 'overall',
      action: 'end',
      success: true,
    });    
    expect(markers.length).toBe(8);
  });
});

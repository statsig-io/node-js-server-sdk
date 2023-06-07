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
import { assertMarkerEqual } from './StatsigTestUtils';
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
        events = events.concat(JSON.parse(params.body)['events']);
        return Promise.resolve({
          ok: true,
        });
      }

      if (url.includes('id_list_content')) {
        let wholeList = '';
        for (var i = 1; i <= 5; i++) {
          wholeList += `+${i}\n`;
        }
        const startingIndex = parseInt(
          // @ts-ignore
          /\=(.*)\-/.exec(params['headers']['Range'])[1],
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

  it.each([true, false])(
    'test network init success',
    async (disableDiagnostics) => {
      await Statsig.initialize('secret-key', {
        loggingMaxBufferSize: 1,
        disableDiagnostics,
      });

      Statsig.shutdown();

      if (disableDiagnostics) {
        expect(events.length).toBe(0);
        return;
      }

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event['eventName']).toBe('statsig::diagnostics');

      const metadata = event['metadata'];
      expect(metadata).not.toBeNull();
      expect(metadata['context']).toBe('initialize');

      const markers = metadata['markers'];
      assertMarkerEqual(markers[0], 'overall', 'start');
      assertMarkerEqual(markers[1], 'download_config_specs', 'start', {
        step: 'network_request',
      });
      assertMarkerEqual(markers[2], 'download_config_specs', 'end', {
        step: 'network_request',
        value: 200,
      });
      assertMarkerEqual(markers[3], 'download_config_specs', 'start', {
        step: 'process',
      });
      assertMarkerEqual(markers[4], 'download_config_specs', 'end', {
        step: 'process',
        value: true,
      });
      assertMarkerEqual(markers[5], 'get_id_list_sources', 'start', {
        step: 'network_request',
      });
      assertMarkerEqual(markers[6], 'get_id_list_sources', 'end', {
        step: 'network_request',
        value: 200,
      });
      assertMarkerEqual(markers[7], 'get_id_list_sources', 'start', {
        step: 'process',
      });
      assertMarkerEqual(markers[8], 'get_id_list_sources', 'end', {
        step: 'process',
      });
      assertMarkerEqual(markers[9], 'overall', 'end', { value: 'success' });
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
    assertMarkerEqual(markers[0], 'overall', 'start');
    assertMarkerEqual(markers[1], 'download_config_specs', 'start', {
      step: 'network_request',
    });
    assertMarkerEqual(markers[2], 'download_config_specs', 'end', {
      step: 'network_request',
      value: 500,
    });
    assertMarkerEqual(markers[3], 'get_id_list_sources', 'start', {
      step: 'network_request',
    });
    assertMarkerEqual(markers[4], 'get_id_list_sources', 'end', {
      step: 'network_request',
      value: 200,
    });
    assertMarkerEqual(markers[5], 'get_id_list_sources', 'start', {
      step: 'process',
    });
    assertMarkerEqual(markers[6], 'get_id_list_sources', 'end', {
      step: 'process',
    });
    assertMarkerEqual(markers[7], 'overall', 'end', { value: 'success' });
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
    assertMarkerEqual(markers[0], 'overall', 'start');
    // Skip download config specs
    assertMarkerEqual(markers[5], 'get_id_list_sources', 'start', {
      step: 'network_request',
    });
    assertMarkerEqual(markers[6], 'get_id_list_sources', 'end', {
      step: 'network_request',
      value: 200,
    });
    assertMarkerEqual(markers[7], 'get_id_list_sources', 'start', {
      step: 'process',
    });
    assertMarkerEqual(markers[8], 'get_id_list_sources', 'end', {
      step: 'process',
    });
    assertMarkerEqual(markers[9], 'get_id_list', 'start', {
      step: 'network_request',
      metadata: { url: 'https://id_list_content/list_1' },
    });
    assertMarkerEqual(markers[10], 'get_id_list', 'end', {
      step: 'network_request',
      value: 200,
      metadata: { url: 'https://id_list_content/list_1' },
    });
    assertMarkerEqual(markers[11], 'get_id_list', 'start', {
      step: 'process',
      metadata: { url: 'https://id_list_content/list_1' },
    });
    assertMarkerEqual(markers[12], 'get_id_list', 'end', {
      step: 'process',
      value: true,
      metadata: { url: 'https://id_list_content/list_1' },
    });
    assertMarkerEqual(markers[13], 'overall', 'end', { value: 'success' });
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
    assertMarkerEqual(markers[0], 'overall', 'start');
    assertMarkerEqual(markers[1], 'bootstrap', 'start', { step: 'process' });
    assertMarkerEqual(markers[2], 'bootstrap', 'end', {
      step: 'process',
      value: true,
    });
    // Skip downloadConfig / get_id_list_sources
    assertMarkerEqual(markers[markers.length - 1], 'overall', 'end', {
      value: 'success',
    });
    expect(markers.length).toBe(12);
  });
});

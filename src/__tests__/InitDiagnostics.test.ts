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

  it('test network init success', async () => {
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
    assertMarkerEqual(
      markers[1],
      'download_config_specs',
      'start',
      'network_request',
    );
    assertMarkerEqual(
      markers[2],
      'download_config_specs',
      'end',
      'network_request',
      200,
    );
    assertMarkerEqual(markers[3], 'download_config_specs', 'start', 'process');
    assertMarkerEqual(
      markers[4],
      'download_config_specs',
      'end',
      'process',
      true,
    );
    assertMarkerEqual(markers[5], 'get_id_lists', 'start', 'network_request');
    assertMarkerEqual(
      markers[6],
      'get_id_lists',
      'end',
      'network_request',
      200,
    );
    assertMarkerEqual(markers[7], 'get_id_lists', 'start', 'process', 0); // do we want to log "process" if id list is empty??
    assertMarkerEqual(markers[8], 'get_id_lists', 'end', 'process', true);
    assertMarkerEqual(markers[9], 'overall', 'end');
    expect(markers.length).toBe(10);
  });

  it('test network init failure', async () => {
    downloadConfigSpecsResponse = {
      status: 500,
      ok: false,
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
    assertMarkerEqual(
      markers[1],
      'download_config_specs',
      'start',
      'network_request',
    );
    assertMarkerEqual(
      markers[2],
      'download_config_specs',
      'end',
      'network_request',
      'request error',
    );
    assertMarkerEqual(markers[3], 'get_id_lists', 'start', 'network_request');
    assertMarkerEqual(
      markers[4],
      'get_id_lists',
      'end',
      'network_request',
      200,
    );
    assertMarkerEqual(markers[5], 'get_id_lists', 'start', 'process', 0); // do we want to log "process" if id list is empty??
    assertMarkerEqual(markers[6], 'get_id_lists', 'end', 'process', true);
    assertMarkerEqual(markers[7], 'overall', 'end');
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
    assertMarkerEqual(markers[5], 'get_id_lists', 'start', 'network_request');
    assertMarkerEqual(
      markers[6],
      'get_id_lists',
      'end',
      'network_request',
      200,
    );
    assertMarkerEqual(markers[7], 'get_id_lists', 'start', 'process', 1); // do we want to log "process" if id list is empty??
    assertMarkerEqual(markers[8], 'get_id_lists', 'end', 'process', true);
    assertMarkerEqual(markers[9], 'overall', 'end');
    expect(markers.length).toBe(10);
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
    assertMarkerEqual(markers[1], 'bootstrap', 'start', 'load');
    assertMarkerEqual(markers[2], 'bootstrap', 'end', 'load');
    // Skip downloadConfig() / getIDList()
    assertMarkerEqual(markers[markers.length - 1], 'overall', 'end');
    expect(markers.length).toBe(4);
  });

  it('test data adapter init', async () => {
    const dataAdapter = new TestSyncingDataAdapter([
      DataAdapterKey.Rulesets,
      DataAdapterKey.IDLists,
    ]);
    await dataAdapter.initialize();
    await dataAdapter.set(
      DataAdapterKey.Rulesets,
      JSON.stringify({
        dynamic_configs: [exampleConfigSpecs.config],
        feature_gates: GatesForIdListTest,
        layer_configs: [],
        layers: [],
        has_updates: true,
      }),
      Date.now(),
    );
    dataAdapter.set(DataAdapterKey.IDLists, '["user_id_list"]');
    dataAdapter.set(
      DataAdapterKey.IDLists + '::user_id_list',
      '+Z/hEKLio\n+M5m6a10x\n',
    );

    const statsigOptions = {
      dataAdapter: dataAdapter,
      environment: { tier: 'staging' },
      loggingMaxBufferSize: 1,
    };

    await Statsig.initialize('secret-key', statsigOptions);

    Statsig.shutdown();

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata).not.toBeNull();
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], 'overall', 'start');
    assertMarkerEqual(markers[1], 'data_adapter', 'start', 'load');
    assertMarkerEqual(markers[2], 'data_adapter', 'end', 'load');
    assertMarkerEqual(markers[3], 'overall', 'end');
    expect(markers.length).toBe(4);
  });
});

function assertMarkerEqual(
  marker: any,
  key: string,
  action: string,
  step: any = null,
  value: any = null,
) {
  expect(marker['key']).toBe(key);
  expect(marker['action']).toBe(action);
  expect(marker['step']).toBe(step);
  expect(marker['value']).toBe(value);
  expect(marker['timestamp'] instanceof Number);
}

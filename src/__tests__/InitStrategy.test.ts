import { metadata } from 'figlet';
import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { MarkerMetadata } from '../Diagnostics';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./data/eval_details_download_config_specs.json'),
);

describe('InitStrategy', () => {
  let events: {
    eventName: string;
    metadata: { gate?: string; config?: string; isManualExposure?: string };
  }[] = [];

  let getIDListJSON;
  let downloadConfigSpecsResponse;
  let idlistCalled;

  beforeEach(async () => {
    getIDListJSON = {};
    idlistCalled = false;
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
        idlistCalled = true;
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
        idlistCalled = true;
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

  it('await strategy', async () => {
    getIDListJSON = {
      list_1: {
        name: 'list_1',
        size: 15,
        url: 'https://id_list_content/list_1',
        fileID: 'file_id_1',
        creationTime: 1,
      },
    };

    await Statsig.initialize('secret-key', { loggingMaxBufferSize: 1, initStrategyForIDLists: 'await', initStrategyForIP3Country: 'await' });

    Statsig.shutdown();

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];
    assertMarkerEqual(markers[0], 'overall', 'start');
    // Skip download config specs
    assertMarkerEqual(markers[5], 'get_id_list_sources', 'start', {step: 'network_request'});
    assertMarkerEqual(
      markers[6],
      'get_id_list_sources',
      'end',
      {
        step: 'network_request',
        value: 200,
      }
    );
    assertMarkerEqual(markers[7], 'get_id_list_sources', 'start', {step: 'process'}); 
    assertMarkerEqual(markers[8], 'get_id_list_sources', 'end', {step: 'process'});
    assertMarkerEqual(markers[9], 'get_id_list', 'start', {step: 'network_request', metadata: {url: 'https://id_list_content/list_1'}});
    assertMarkerEqual(markers[10], 'get_id_list', 'end', {step: 'network_request', value: 200, metadata: {url: 'https://id_list_content/list_1'}});
    assertMarkerEqual(markers[11], 'get_id_list', 'start', {step: 'process'});
    assertMarkerEqual(markers[12], 'get_id_list', 'end', {step: 'process', value: true});
    assertMarkerEqual(markers[13], 'overall', 'end', {value: 'success'});
    expect(markers.length).toBe(14);

    expect(idlistCalled).toBe(true);
  });

  it('none strategy', async () => {
    getIDListJSON = {
      list_1: {
        name: 'list_1',
        size: 15,
        url: 'https://id_list_content/list_1',
        fileID: 'file_id_1',
        creationTime: 1,
      },
    };

    await Statsig.initialize('secret-key', { loggingMaxBufferSize: 1, initStrategyForIDLists: 'none', initStrategyForIP3Country: 'none' });

    Statsig.shutdown();

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];

    assertMarkerEqual(markers[0], 'overall', 'start');
    assertMarkerEqual(markers[5], 'overall', 'end', {value: 'success'});
    expect(markers.length).toBe(6);

    expect(idlistCalled).toBe(false);
  });

  it('id list lazy strategy', async () => {
    jest.useFakeTimers();

    getIDListJSON = {
      list_1: {
        name: 'list_1',
        size: 15,
        url: 'https://id_list_content/list_1',
        fileID: 'file_id_1',
        creationTime: 1,
      },
    };

    await Statsig.initialize('secret-key', { loggingMaxBufferSize: 1, initStrategyForIDLists: 'lazy', initStrategyForIP3Country: 'lazy' });

    Statsig.flush();

    expect(idlistCalled).toBe(false);

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');

    const metadata = event['metadata'];
    expect(metadata['context']).toBe('initialize');

    const markers = metadata['markers'];

    assertMarkerEqual(markers[0], 'overall', 'start');
    assertMarkerEqual(markers[5], 'overall', 'end', {value: 'success'});
    expect(markers.length).toBe(6);
    jest.runOnlyPendingTimers();

    // Allow timeout functions to run
    await Promise.resolve();
    expect(idlistCalled).toBe(true);

    Statsig.shutdown();
  });
});

function assertMarkerEqual(
  marker: any,
  key: string,
  action: string,
  optionalArgs?: {
    step?: any,
    value?: any,
    metadata?: MarkerMetadata,
  }
) {
  const { step, value, metadata } = optionalArgs || {};
  expect(marker['key']).toBe(key);
  expect(marker['action']).toBe(action);
  expect(marker['step']).toBe(step || null);
  expect(marker['value']).toBe(value || null);
  expect(marker['timestamp'] instanceof Number);
  expect(marker['metadata']).toStrictEqual(metadata);
}

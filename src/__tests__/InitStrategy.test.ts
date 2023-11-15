import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import { assertMarkerEqual, getDecodedBody } from './StatsigTestUtils';

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
        events = events.concat(getDecodedBody(params)['events']);
        return Promise.resolve({
          ok: true,
        });
      }

      if (url.includes('id_list_content')) {
        idlistCalled = true;
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

    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1,
      initStrategyForIDLists: 'await',
      initStrategyForIP3Country: 'await',
    });

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

    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1,
      initStrategyForIDLists: 'none',
      initStrategyForIP3Country: 'none',
    });

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
    assertMarkerEqual(markers[5], {
      key: 'overall',
      action: 'end',
      success: true,
    });

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

    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1,
      initStrategyForIDLists: 'lazy',
      initStrategyForIP3Country: 'lazy',
    });

    Statsig.flush();

    expect(idlistCalled).toBe(false);

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
    assertMarkerEqual(markers[5], {
      key: 'overall',
      action: 'end',
      success: true,
    });

    expect(markers.length).toBe(6);
    jest.runOnlyPendingTimers();

    // Allow timeout functions to run
    await Promise.resolve();
    expect(idlistCalled).toBe(true);

    Statsig.shutdown();
  });
});

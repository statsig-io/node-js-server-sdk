import { MAX_MARKER_COUNT, MAX_SAMPLING_RATE } from '../Diagnostics';
import Statsig from '../index';
import StatsigInstanceUtils from '../StatsigInstanceUtils';
import exampleConfigSpecs from './jest.setup';
import { assertMarkerEqual, getDecodedBody } from './StatsigTestUtils';

jest.mock('node-fetch', () => jest.fn());

const CONFIG_SPEC_RESPONSE = {
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
      api_call: MAX_SAMPLING_RATE
    },
  };

describe('CoreAPIDiagnostics', () => {
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
      json: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
      text: () => Promise.resolve(JSON.stringify(CONFIG_SPEC_RESPONSE)),
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
    'test core api',
    async (disableDiagnostics) => {
      await Statsig.initialize('secret-key', {
        disableDiagnostics,
      });
      const user = {
        userID: "testUser"
      }
      Statsig.checkGateSync( user,'nfl_gate')
      Statsig.getExperimentSync( user,'teams')
      Statsig.getConfigSync( user,'teams')
      Statsig.getLayerSync(user,"unallocated_layer")
      Statsig.shutdown();
      events = events.filter(event => event.eventName === 'statsig::diagnostics')
      if(disableDiagnostics) {
        expect(events.length).toBe(1)
        expect(events[0].metadata['context']).toBe('initialize')
        return 
      }
      expect(events.length).toBe(2);
      expect(events[1].metadata['context']).toBe('api_call')
      const markers = events[1].metadata.markers
      expect(markers.length).toBe(8)
      assertMarkerEqual(markers[0], {
        key: 'check_gate',
        action: 'start',
        markerID: 'checkGate_0',
        configName: 'nfl_gate'
      })
      assertMarkerEqual(markers[1], {
        key: 'check_gate',
        action: 'end',
        markerID: 'checkGate_0',
        configName: 'nfl_gate',
        success: true
      })
      assertMarkerEqual(markers[2], {
        key: 'get_experiment',
        action: 'start',
        markerID: 'getExperiment_2',
        configName: 'teams',
      })
      assertMarkerEqual(markers[3], {
        key: 'get_experiment',
        action: 'end',
        markerID: 'getExperiment_2',
        configName: 'teams',
        success: true
      })
      assertMarkerEqual(markers[4], {
        key: 'get_config',
        action: 'start',
        markerID: 'getConfig_4',
        configName: 'teams'
      })
      assertMarkerEqual(markers[5], {
        key: 'get_config',
        action: 'end',
        markerID: 'getConfig_4',
        configName: 'teams',
        success: true
      })
      assertMarkerEqual(markers[6], {
        key: 'get_layer',
        action: 'start',
        markerID: 'getLayer_6',
        configName: 'unallocated_layer'
      })
      assertMarkerEqual(markers[7], {
        key: 'get_layer',
        action: 'end',
        markerID: 'getLayer_6',
        success: true,
        configName: 'unallocated_layer'
      })
  });

  it('test max_markers', async () => {
    await Statsig.initialize('secret-key', {
      loggingMaxBufferSize: 1000,
      rulesetsSyncIntervalMs: 1000,
      disableDiagnostics: false,
    });
    const user = { userID: 'test_user' };
    for(let i = 0; i < MAX_MARKER_COUNT*4; i++) {
      Statsig.checkGateSync(user, 'a_gate');
    }
    Statsig.shutdown();
    events = events.filter((e) => e['metadata']['context'] === 'api_call');

    expect(events.length).toBe(1);
    const event = events[0];
    expect(event['eventName']).toBe('statsig::diagnostics');
    
    const markers = event['metadata']['markers'];
    expect(markers.length).toBe(MAX_MARKER_COUNT);
  });
});

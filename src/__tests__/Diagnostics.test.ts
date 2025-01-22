import Diagnostics, {
  ContextType,
  DiagnosticsImpl,
  KeyType,
} from '../Diagnostics';
import ErrorBoundary from '../ErrorBoundary';
import LogEventProcessor from '../LogEventProcessor';
import { OptionsLoggingCopy, OptionsWithDefaults } from '../StatsigOptions';
import StatsigFetcher from '../utils/StatsigFetcher';
import { getDecodedBody } from './StatsigTestUtils';

jest.mock('node-fetch', () => jest.fn());

function getMarkers(): DiagnosticsImpl['markers'] {
  return (Diagnostics as any).instance.markers;
}

describe('Diagnostics', () => {
  const options = { loggingMaxBufferSize: 1 }
  const logger = new LogEventProcessor(
    new StatsigFetcher('secret-asdf1234', options),
    new ErrorBoundary('secret-asdf1234', options, 'sessionID-a'),
    OptionsWithDefaults(options),
    OptionsLoggingCopy(options),
    'sessionID'
  );

  let events: {
    eventName: string;
    metadata: { gate?: string; config?: string; isManualExposure?: string };
  }[] = [];

  beforeEach(async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('log_event')) {
        events = events.concat(getDecodedBody(params)['events']);
        return Promise.resolve({
          ok: true,
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
    });

    events = [];
    Diagnostics.initialize({ logger });
    Diagnostics.instance.setSamplingRate({
      dcs: 5000,
      log: 5000,
      idlist: 5000,
      initialize: 5000,
      api_call: 5000
    })
  });

  it.each(['initialize', 'config_sync', 'event_logging'] as ContextType[])(
    'test .mark() %s',
    async (context: ContextType) => {
      assertMarkersEmpty();
      Diagnostics.setContext(context);
      Diagnostics.mark.downloadConfigSpecs.process.start();
      expect(getMarkers().initialize).toHaveLength(
        context === 'initialize' ? 1 : 0,
      );
      expect(getMarkers().config_sync).toHaveLength(
        context === 'config_sync' ? 1 : 0,
      );
      expect(getMarkers().event_logging).toHaveLength(
        context === 'event_logging' ? 1 : 0,
      );
    },
  );

  it('test .logDiagnostics()', async () => {
    assertMarkersEmpty();

    let time = 1;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      return time++;
    });

    Diagnostics.setContext('initialize');
    Diagnostics.mark.downloadConfigSpecs.process.start({});
    Diagnostics.setContext('config_sync');
    Diagnostics.mark.downloadConfigSpecs.process.start({});

    const assertLogDiagnostics = async (
      context: ContextType,
      expectedTime: number,
    ) => {
      Diagnostics.logDiagnostics(context);
      await logger.flush()
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('statsig::diagnostics');
      expect(events[0].metadata['context']).toEqual(context);
      expect(events[0].metadata['markers'][0]['timestamp']).toEqual(
        expectedTime,
      );
      if(context == "initialize") {
        expect(events[0].metadata['statsigOptions']).toEqual({
          loggingMaxBufferSize: 1
        })
      } else {
        expect(events[0].metadata['statsigOptions']).toBeUndefined()
      }
      events = [];
    };

    await assertLogDiagnostics('initialize', 1);
    await assertLogDiagnostics('config_sync', 2);
  });

  const types = ['initialize', 'id_list', 'config_spec', 'api_call'] as const;
  it.each(types)('test sampling rate for %s', async (type) => {
    const context: ContextType =
      type ==='api_call'? 'api_call': (type === 'initialize' ? 'initialize' : 'config_sync');
    for (let i = 0; i < 1000; i++) {
      Diagnostics.mark.downloadConfigSpecs.networkRequest.start({}, context);
      Diagnostics.logDiagnostics(context, {
        type: type,
      });
    }
    await logger.flush()
    expect(events.length).toBeGreaterThan(400);
    expect(events.length).toBeLessThan(600);
  });
});

function assertMarkersEmpty() {
  expect(getMarkers().initialize).toHaveLength(0);
  expect(getMarkers().config_sync).toHaveLength(0);
  expect(getMarkers().event_logging).toHaveLength(0);
}

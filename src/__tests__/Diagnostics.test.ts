import Diagnostics, { ContextType } from '../Diagnostics';
import LogEventProcessor from '../LogEventProcessor';
import { OptionsWithDefaults } from '../StatsigOptions';
import StatsigFetcher from '../utils/StatsigFetcher';

jest.mock('node-fetch', () => jest.fn());

describe('Diagnostics', () => {
  const options = OptionsWithDefaults({ loggingMaxBufferSize: 1 });
  const logger = new LogEventProcessor(
    new StatsigFetcher('secret-asdf1234', options),
    options,
  );
  let diagnostics: Diagnostics;

  let events: {
    eventName: string;
    metadata: { gate?: string; config?: string; isManualExposure?: string };
  }[] = [];

  beforeEach(async () => {
    const fetch = require('node-fetch');
    fetch.mockImplementation((url: string, params) => {
      if (url.includes('log_event')) {
        events = events.concat(JSON.parse(params.body)['events']);
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
    diagnostics = new Diagnostics({ logger });
  });

  it.each(['initialize', 'config_sync', 'event_logging'] as ContextType[])(
    'test .mark() %s',
    async (context: ContextType) => {
      assertMarkersEmpty(diagnostics);

      diagnostics.mark(context, 'download_config_specs', 'start');
      expect(diagnostics.markers.intialize).toHaveLength(
        context === 'initialize' ? 1 : 0,
      );
      expect(diagnostics.markers.configSync).toHaveLength(
        context === 'config_sync' ? 1 : 0,
      );
      expect(diagnostics.markers.eventLogging).toHaveLength(
        context === 'event_logging' ? 1 : 0,
      );
    },
  );

  it('test .logDiagnostics()', async () => {
    assertMarkersEmpty(diagnostics);

    let time = 1;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      return time++;
    });

    diagnostics.mark('initialize', 'download_config_specs', 'start');
    diagnostics.mark('config_sync', 'download_config_specs', 'start');
    diagnostics.mark('event_logging', 'download_config_specs', 'start');

    const assertLogDiagnostics = (
      context: ContextType,
      expectedTime: number,
    ) => {
      diagnostics.logDiagnostics(context);
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('statsig::diagnostics');
      expect(events[0].metadata['context']).toEqual(context);
      expect(events[0].metadata['markers'][0]['timestamp']).toEqual(
        expectedTime,
      );
      events = [];
    };

    assertLogDiagnostics('initialize', 1);
    assertLogDiagnostics('config_sync', 2);
    assertLogDiagnostics('event_logging', 3);
  });
});

function assertMarkersEmpty(diagnostics: Diagnostics) {
  expect(diagnostics.markers.intialize).toHaveLength(0);
  expect(diagnostics.markers.configSync).toHaveLength(0);
  expect(diagnostics.markers.eventLogging).toHaveLength(0);
}

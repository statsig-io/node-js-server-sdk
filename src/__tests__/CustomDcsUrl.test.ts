import Diagnostics from '../Diagnostics';
import ErrorBoundary from '../ErrorBoundary';
import LogEvent from '../LogEvent';
import LogEventProcessor from '../LogEventProcessor';
import SpecStore from '../SpecStore';
import { OptionsWithDefaults } from '../StatsigOptions';
import StatsigFetcher from '../utils/StatsigFetcher';

const jsonResponse = {
  time: Date.now(),
  feature_gates: [],
  dynamic_configs: [],
  layer_configs: [],
  has_updates: true,
};
const dcsPath = '/download_config_specs';
const customUrl = 'custom_download_config_specs_url';

describe('Check custom DCS url', () => {
  const options = OptionsWithDefaults({
    apiForDownloadConfigSpecs: customUrl,
    disableDiagnostics: true,
  });
  const secretKey = 'secret-123';
  const errorBoundary  = new ErrorBoundary(secretKey, options, "sessionid-1")
  const fetcher = new StatsigFetcher(secretKey, options);
  const logger = new LogEventProcessor(fetcher,errorBoundary, options);
  const store = new SpecStore(fetcher, options);
  Diagnostics.initialize({ logger });

  const spy = jest.spyOn(fetcher, 'request').mockImplementation(async () => {
    return new Response(JSON.stringify(jsonResponse), { status: 200 });
  });

  it('works', async () => {
    await store.init();
    logger.log(new LogEvent('test'));
    await logger.flush();

    expect(spy).toHaveBeenCalledWith('GET', customUrl + dcsPath + `/${secretKey}.json`, undefined);
    expect(spy).not.toHaveBeenCalledWith(
      'POST',
      customUrl + '/get_id_lists',
      expect.anything(),
    );
    expect(spy).not.toHaveBeenCalledWith(
      'POST',
      customUrl + '/log_event',
      expect.anything(),
    );

    spy.mock.calls.forEach((u) => {
      if (u[0].endsWith(dcsPath) && u[0] != customUrl + dcsPath) {
        fail('download_config_spec should not be called on another base url');
      }
    });
  });
});

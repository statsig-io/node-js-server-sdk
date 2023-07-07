import { OptionsWithDefaults } from '../StatsigOptions';
import StatsigServer from '../StatsigServer';

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
  });
  const statsigServer = new StatsigServer('secret-123', options);
  
  const spy = jest
    // @ts-ignore  
    .spyOn(statsigServer._fetcher, 'post')
    .mockImplementation(() => {
      return new Promise((r) => {
        return new Response(JSON.stringify(jsonResponse), { status: 200 });
      })
    });
  
  it('works', async () => {
    await statsigServer.initializeAsync();
    statsigServer.logEvent({ userID: '42' }, 'test');
    await statsigServer.flush();

    expect(spy).toHaveBeenCalledWith(customUrl + dcsPath, expect.anything());
    expect(spy).not.toHaveBeenCalledWith(
      customUrl + '/get_id_lists',
      expect.anything(),
    );
    expect(spy).not.toHaveBeenCalledWith(
      customUrl + '/log_event',
      expect.anything(),
    );

    spy.mock.calls.forEach(u => {
      if (u[0].endsWith(dcsPath) && u[0] != customUrl + dcsPath) {
        fail('download_config_spec should not be called on another base url');
      }
    });
  });
});
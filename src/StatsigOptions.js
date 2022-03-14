const DEFAULT_API = 'https://statsigapi.net/v1';
const DEFAULT_CDN_BASED_API = 'https://api.statsigcdn.com/v1';

module.exports = function StatsigOptions(inputOptions) {
  const statsigOptions = {
    _cdnBasedApi: DEFAULT_CDN_BASED_API,
    api: getString('api', DEFAULT_API),
    bootstrapValues: getString('bootstrapValues', null),
    environment: getObject('environment', null),
    rulesUpdatedCallback: getFunction('rulesUpdatedCallback'),
    localMode: getBoolean('localMode', false),
    initTimeoutMs: getNumber('initTimeoutMs', 0),
    useCdnUrlForDownloadConfigSpecs: getBoolean(
      'useCdnUrlForDownloadConfigSpecs',
      false
    ),
  };

  function getBoolean(index, defaultValue) {
    const b = inputOptions[index];
    if (b == null || typeof b !== 'boolean') {
      return defaultValue;
    }
    return b;
  }

  function getString(index, defaultValue) {
    const str = inputOptions[index];
    if (str == null || typeof str !== 'string') {
      return defaultValue;
    }
    return str;
  }

  function getObject(index, defaultValue) {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'object') {
      return defaultValue;
    }
    return obj;
  }

  function getFunction(index) {
    const func = inputOptions[index];
    if (func == null || typeof func !== 'function') {
      return null;
    }
    return func;
  }

  function getNumber(index, defaultValue) {
    const obj = inputOptions[index];
    if (obj == null || typeof obj !== 'number') {
      return defaultValue;
    }
    return obj;
  }

  return statsigOptions;
};

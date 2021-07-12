const DEFAULT_API = 'https://api.statsig.com/v1';

module.exports = function StatsigOptions(inputOptions) {
  const statsigOptions = {
    api: getString('api', DEFAULT_API),
    bootstrapValues: getString('bootstrapValues', null),
    environment: getObject('environment', null),
    rulesUpdatedCallback: getFunction('rulesUpdatedCallback'),
  };

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

  return statsigOptions;
};

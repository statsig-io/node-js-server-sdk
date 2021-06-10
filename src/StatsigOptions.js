const DEFAULT_API = 'https://api.statsig.com/v1';

module.exports = function StatsigOptions(inputOptions) {
  if (inputOptions == null || inputOptions == {}) {
    return {
      api: DEFAULT_API,
      environment: null,
    };
  }

  const statsigOptions = {
    api: getString('api', DEFAULT_API),
    environment: inputOptions['environment'],
  };

  function getString(index, defaultValue) {
    const str = inputOptions[index];
    if (str == null || typeof str !== 'string') {
      return defaultValue;
    }
    return str;
  }

  return statsigOptions;
};

import { LoggerInterface } from './StatsigOptions';

let _logger: LoggerInterface = { ...console, logLevel: 'warn' };

export default abstract class OutputLogger {
  static getLogger(): LoggerInterface {
    return _logger;
  }

  static debug(message?: any, ...optionalParams: any[]) {
    if (_logger.logLevel !== 'none') {
      _logger.debug && _logger.debug(message, ...optionalParams);
    }
  }

  static info(message?: any, ...optionalParams: any[]) {
    if (
      _logger.logLevel === 'info' ||
      _logger.logLevel === 'warn' ||
      _logger.logLevel === 'error'
    ) {
      _logger.info && _logger.info(message, ...optionalParams);
    }
  }

  static warn(message?: any, ...optionalParams: any[]) {
    if (_logger.logLevel === 'warn' || _logger.logLevel === 'error') {
      _logger.warn(message, ...optionalParams);
    }
  }

  static error(message?: any, ...optionalParams: any[]) {
    if (_logger.logLevel === 'error') {
      _logger.error(message, ...optionalParams);
    }
  }

  static setLogger(logger: LoggerInterface) {
    _logger = logger;
  }

  static resetLogger() {
    _logger = { ...console, logLevel: 'warn' };
  }
}

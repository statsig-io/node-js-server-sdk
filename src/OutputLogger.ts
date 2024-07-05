/* eslint-disable @typescript-eslint/no-explicit-any */
import { LoggerInterface } from './StatsigOptions';

let _logger: LoggerInterface = { ...console, logLevel: 'warn' };
let _sdkKey: string | null = null;

export default abstract class OutputLogger {
  static getLogger(): LoggerInterface {
    return _logger;
  }

  static debug(message?: any, ...optionalParams: any[]) {
    if (_logger.logLevel !== 'none') {
      const sanitizedMessage = this.sanitizeError(message);
      _logger.debug && _logger.debug(sanitizedMessage, ...optionalParams);
    }
  }

  static info(message?: any, ...optionalParams: any[]) {
    if (
      _logger.logLevel === 'info' ||
      _logger.logLevel === 'warn' ||
      _logger.logLevel === 'error'
    ) {
      const sanitizedMessage = this.sanitizeError(message);
      _logger.info && _logger.info(sanitizedMessage, ...optionalParams);
    }
  }

  static warn(message?: any, ...optionalParams: any[]) {
    if (_logger.logLevel === 'warn' || _logger.logLevel === 'error') {
      const sanitizedMessage = this.sanitizeError(message);
      _logger.warn(sanitizedMessage, ...optionalParams);
    }
  }

  static error(message?: any, ...optionalParams: any[]) {
    if (_logger.logLevel === 'error') {
      const sanitizedMessage = this.sanitizeError(message);
      _logger.error(sanitizedMessage, ...optionalParams);
    }
  }

  static setLogger(logger: LoggerInterface, sdkKey: string) {
    _logger = logger;
    _sdkKey = sdkKey;
  }

  static resetLogger() {
    _logger = { ...console, logLevel: 'warn' };
  }

  static sanitizeError(message: any): any {
    if (_sdkKey === null) {
      return message;
    }
    try {
      if (typeof message === 'string') {
        return message.replace(new RegExp(_sdkKey, 'g'), '******');
      } else if (message instanceof Error) {
        return message.toString().replace(new RegExp(_sdkKey, 'g'), '******');
      }
    } catch (_e) {
      // ignore
    }
    return message;
  }
}

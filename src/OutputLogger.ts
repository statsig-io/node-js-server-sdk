import { LoggerInterface } from './StatsigOptions';

let _logger: LoggerInterface = console;

export default abstract class OutputLogger {
  static getLogger(): LoggerInterface {
    return _logger;
  }

  static setLogger(logger: LoggerInterface) {
    _logger = logger;
  }

  static resetLogger() {
    _logger = console;
  }
}

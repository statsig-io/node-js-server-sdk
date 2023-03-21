import StatsigServer from './StatsigServer';

let _instance: StatsigServer | null = null;

export default abstract class StatsigInstanceUtils {
  static getInstance(): StatsigServer | null {
    return _instance;
  }

  static setInstance(instance: StatsigServer | null) {
    _instance = instance;
  }
}

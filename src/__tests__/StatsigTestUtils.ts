import Evaluator from '../Evaluator';
import LogEventProcessor from '../LogEventProcessor';
import StatsigInstanceUtils from '../StatsigInstanceUtils';

export default abstract class StatsigTestUtils {
  static getEvaluator(): any {
    // @ts-ignore
    return StatsigInstanceUtils.getInstance()?._evaluator ?? null;
  }

  static getLogger(): any {
    // @ts-ignore
    return StatsigInstanceUtils.getInstance()?._logger ?? null;
  }
}

import { ActionType, MarkerMetadata, StepType, KeyType } from '../Diagnostics';
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


export function assertMarkerEqual(
  marker: any,
  key: KeyType,
  action: ActionType,
  optionalArgs?: {
    step?: StepType,
    value?: any,
    metadata?: MarkerMetadata,
  }
) {
  const { step, value, metadata } = optionalArgs || {};
  expect(marker['key']).toBe(key);
  expect(marker['action']).toBe(action);
  expect(marker['step']).toBe(step || null);
  expect(marker['value']).toBe(value || null);
  expect(marker['timestamp'] instanceof Number);
  expect(marker['metadata']).toStrictEqual(metadata);
}

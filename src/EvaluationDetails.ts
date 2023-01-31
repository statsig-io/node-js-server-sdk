import { EvaluationReason } from './EvaluationReason';

export class EvaluationDetails {
  readonly configSyncTime: number;
  readonly initTime: number;
  readonly serverTime: number;
  readonly reason: EvaluationReason;

  private constructor(
    configSyncTime: number,
    initTime: number,
    reason: EvaluationReason,
  ) {
    this.configSyncTime = configSyncTime;
    this.initTime = initTime;
    this.reason = reason;
    this.serverTime = Date.now();
  }

  static uninitialized() {
    return new EvaluationDetails(
      0,
      0,
      'Uninitialized',
    );
  }

  static make(lastUpdateTime: number, initialUpdateTime: number, reason: EvaluationReason) {
    return new EvaluationDetails(
      initialUpdateTime,
      lastUpdateTime,
      reason,
    );
  }
}

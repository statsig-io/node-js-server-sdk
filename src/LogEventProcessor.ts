const { getStatsigMetadata } = require('./utils/core');
import LogEvent from './LogEvent';
import { StatsigUser } from './StatsigUser';
import ConfigEvaluation from './ConfigEvaluation';
import StatsigFetcher from './utils/StatsigFetcher';
import StatsigOptions from './StatsigOptions';
import { StatsigLocalModeNetworkError } from './Errors';
const Layer = require('./Layer');

const CONFIG_EXPOSURE_EVENT = 'config_exposure';
const LAYER_EXPOSURE_EVENT = 'layer_exposure';
const GATE_EXPOSURE_EVENT = 'gate_exposure';
const INTERNAL_EVENT_PREFIX = 'statsig::';

const deduperInterval = 60 * 1000;

export default class LogEventProcessor {
  private options: StatsigOptions;
  private fetcher: StatsigFetcher;

  private queue: LogEvent[];
  private flushTimer: NodeJS.Timer | null;

  private loggedErrors: Set<string>;
  private deduper: Set<string>;
  private deduperTimer: NodeJS.Timer | null;

  public constructor(fetcher: StatsigFetcher, options: StatsigOptions) {
    this.options = options;
    this.fetcher = fetcher;

    this.queue = [];
    this.deduper = new Set();
    this.loggedErrors = new Set();

    const processor = this;
    this.flushTimer = setInterval(function () {
      processor.flush();
    }, options.loggingIntervalMs).unref();

    this.deduperTimer = setInterval(function () {
      processor.deduper.clear();
    }, deduperInterval).unref();
  }

  public log(event: LogEvent, errorKey: string | null = null): void {
    if (this.options.localMode) {
      return;
    }
    if (!(event instanceof LogEvent)) {
      return;
    }

    if (!event.validate()) {
      return;
    }

    if (errorKey != null) {
      if (this.loggedErrors.has(errorKey)) {
        return;
      }
      this.loggedErrors.add(errorKey);
    }

    this.queue.push(event);
    if (this.queue.length >= this.options.loggingMaxBufferSize) {
      this.flush();
    }
  }

  public async flush(fireAndForget: boolean = false): Promise<void> {
    if (this.queue.length === 0) {
      return Promise.resolve();
    }
    const oldQueue = this.queue;
    this.queue = [];
    const body = {
      statsigMetadata: getStatsigMetadata(),
      events: oldQueue,
    };
    return this.fetcher
      .post(this.options.api + '/log_event', body, fireAndForget ? 0 : 5, 10000)
      .then(() => {
        return Promise.resolve();
      })
      .catch((e) => {
        if (!fireAndForget && !(e instanceof StatsigLocalModeNetworkError)) {
          this.logStatsigInternal(null, 'log_event_failed', {
            error: e?.message || 'log_event_failed',
          });
        }
        return Promise.resolve();
      });
  }

  public async shutdown(): Promise<void> {
    if (this.flushTimer != null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.deduperTimer != null) {
      clearTimeout(this.deduperTimer);
      this.deduperTimer = null;
    }
    return this.flush(true);
  }

  public logStatsigInternal(
    user: StatsigUser | null,
    eventName: string,
    metadata: Record<string, unknown> | null,
    secondaryExposures: Record<string, unknown>[] | null = null,
  ) {
    if (!this.isUniqueExposure(user, eventName, metadata)) {
      return;
    }

    let event = new LogEvent(INTERNAL_EVENT_PREFIX + eventName);
    if (user != null) {
      event.setUser(user);
    }

    if (metadata != null) {
      event.setMetadata(metadata);
    }

    if (secondaryExposures != null) {
      event.setSecondaryExposures(secondaryExposures);
    }

    if (metadata?.error != null) {
      this.log(event, eventName + metadata.error);
    } else {
      this.log(event);
    }
  }

  public logGateExposure(
    user: StatsigUser,
    gateName: string,
    gateValue: boolean,
    ruleID: string = '',
    secondaryExposures: Record<string, unknown>[] = [],
  ) {
    this.logStatsigInternal(
      user,
      GATE_EXPOSURE_EVENT,
      {
        gate: gateName,
        gateValue: String(gateValue),
        ruleID: ruleID,
      },
      secondaryExposures,
    );
  }

  public logConfigExposure(
    user: StatsigUser,
    configName: string,
    ruleID: string = '',
    secondaryExposures: Record<string, unknown>[] = [],
  ): void {
    this.logStatsigInternal(
      user,
      CONFIG_EXPOSURE_EVENT,
      {
        config: configName,
        ruleID: ruleID,
      },
      secondaryExposures,
    );
  }

  public logLayerExposure(
    user: StatsigUser,
    layer: typeof Layer,
    parameterName: string,
    configEvaluation: ConfigEvaluation,
  ): void {
    let allocatedExperiment = '';
    let exposures = configEvaluation.undelegated_secondary_exposures;
    const isExplicit =
      configEvaluation.explicit_parameters?.includes(parameterName) ?? false;
    if (isExplicit) {
      allocatedExperiment = configEvaluation.config_delegate ?? '';
      exposures = configEvaluation.secondary_exposures;
    }

    this.logStatsigInternal(
      user,
      LAYER_EXPOSURE_EVENT,
      {
        config: layer.name,
        ruleID: layer.getRuleID(),
        allocatedExperiment: allocatedExperiment,
        parameterName,
        isExplicitParameter: String(isExplicit),
      },
      exposures,
    );
  }

  private isUniqueExposure(
    user: StatsigUser | null,
    eventName: string,
    metadata: Record<string, unknown> | null,
  ): boolean {
    if (user == null) {
      return true;
    }
    let customIdKey = '';
    if (user.customIDs && typeof user.customIDs === 'object') {
      customIdKey = Object.values(user.customIDs).join();
    }

    let metadataKey = '';
    if (metadata && typeof metadata === 'object') {
      metadataKey = Object.values(metadata).join();
    }

    const keyList = [user.userID, customIdKey, eventName, metadataKey];
    const key = keyList.join();
    if (this.deduper.has(key)) {
      return false;
    }

    this.deduper.add(key);
    if (this.deduper.size > 100000) {
      this.deduper.clear();
    }
    return true;
  }
}
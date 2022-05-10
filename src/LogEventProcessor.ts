const { getStatsigMetadata } = require('./utils/core');
import LogEvent from './LogEvent';
import { StatsigUser } from './StatsigUser';
import { StatsigOptionsType } from './StatsigOptionsType';
import ConfigEvaluation from './ConfigEvaluation';
import StatsigFetcher from './utils/StatsigFetcher';
const Layer = require('./Layer');
const fetcher = require('./utils/StatsigFetcher');

const CONFIG_EXPOSURE_EVENT = 'config_exposure';
const LAYER_EXPOSURE_EVENT = 'layer_exposure';
const GATE_EXPOSURE_EVENT = 'gate_exposure';
const INTERNAL_EVENT_PREFIX = 'statsig::';

const flushInterval = 60 * 1000;
const flushBatchSize = 1000;
const deduperInterval = 60 * 1000;

export default class LogEventProcessor {
  private options: StatsigOptionsType;
  private fetcher: StatsigFetcher;

  private queue: LogEvent[];
  private flushTimer: NodeJS.Timer;

  private loggedErrors: Set<string>;
  private deduper: Set<string>;
  private deduperTimer: NodeJS.Timer;

  public constructor(fetcher: StatsigFetcher, options: StatsigOptionsType) {
    this.options = options;
    this.fetcher = fetcher;

    this.queue = [];
    this.deduper = new Set();
    this.loggedErrors = new Set();

    this.flushTimer = setInterval(function () {
      this.flush();
    }, flushInterval);

    this.deduperTimer = setInterval(function () {
      this.deduper.clear();
    }, deduperInterval);
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
    if (this.queue.length >= flushBatchSize) {
      this.flush();
    }
  }

  public flush(waitForResponse: boolean = true) {
    if (!waitForResponse) {
      clearInterval(this.flushTimer);
      clearInterval(this.deduperTimer);
    }

    if (this.queue.length === 0) {
      return;
    }
    const oldQueue = this.queue;
    this.queue = [];
    const body = {
      statsigMetadata: getStatsigMetadata(),
      events: oldQueue,
    };

    if (!waitForResponse) {
      // we are exiting, fire and forget
      this.fetcher
        .post(this.options.api + '/log_event', body, 0)
        .catch((e) => {});
      return;
    }

    this.fetcher
      .post(this.options.api + '/log_event', body, 5, 10000)
      .catch((e) => {
        this.logStatsigInternal(null, 'log_event_failed', {
          error: e?.message || 'log_event_failed',
        });
      });
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
      allocatedExperiment = configEvaluation.config_delegate;
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
    user: StatsigUser,
    eventName: string,
    metadata: Record<string, unknown>,
  ): boolean {
    let customIdKey = '';
    if (user.customIDs && typeof user.customIDs === 'object') {
      customIdKey = Object.values(user.customIDs).join();
    }

    let metadataKey = '';
    if (metadata && typeof metadata === 'object') {
      customIdKey = Object.values(metadata).join();
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

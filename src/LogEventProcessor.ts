import ConfigEvaluation from './ConfigEvaluation';
import Diagnostics, { Marker } from './Diagnostics';
import ErrorBoundary from './ErrorBoundary';
import { EvaluationDetails } from './EvaluationDetails';
import LogEvent, { LogEventData, SecondaryExposure } from './LogEvent';
import OutputLogger from './OutputLogger';
import SDKFlags from './SDKFlags';
import { ExplicitStatsigOptions, StatsigOptions } from './StatsigOptions';
import { StatsigUser } from './StatsigUser';
import { getStatsigMetadata, poll } from './utils/core';
import { GlobalContext, StatsigContext } from './utils/StatsigContext';
import StatsigFetcher from './utils/StatsigFetcher';

const CONFIG_EXPOSURE_EVENT = 'config_exposure';
const LAYER_EXPOSURE_EVENT = 'layer_exposure';
const GATE_EXPOSURE_EVENT = 'gate_exposure';
const DIAGNOSTIC_EVENT = 'diagnostics';
const INTERNAL_EVENT_PREFIX = 'statsig::';
const DEFAULT_VALUE_WARNING = 'default_value_type_mismatch';

const deduperInterval = 60 * 1000;

const ignoredMetadataKeys = new Set([
  'serverTime',
  'configSyncTime',
  'initTime',
  'reason',
]);

export default class LogEventProcessor {
  private explicitOptions: ExplicitStatsigOptions;
  private optionsLoggiingCopy: StatsigOptions;
  private fetcher: StatsigFetcher;

  private queue: LogEventData[];
  private flushTimer: NodeJS.Timer | null;

  private loggedErrors: Set<string>;
  private deduper: Set<string>;
  private deduperTimer: NodeJS.Timer | null;
  private sessionID: string;
  private errorBoundary: ErrorBoundary;

  public constructor(
    fetcher: StatsigFetcher,
    errorBoundry: ErrorBoundary,
    explicitOptions: ExplicitStatsigOptions,
    optionsLoggiingCopy: StatsigOptions,
    sessionID: string,
  ) {
    this.explicitOptions = explicitOptions;
    this.optionsLoggiingCopy = optionsLoggiingCopy;
    this.fetcher = fetcher;
    this.sessionID = sessionID;
    this.errorBoundary = errorBoundry;

    this.queue = [];
    this.deduper = new Set();
    this.loggedErrors = new Set();

    this.flushTimer = poll(() => {
      this.flush();
    }, explicitOptions.loggingIntervalMs);
    this.deduperTimer = poll(() => {
      this.deduper.clear();
    }, deduperInterval);
  }

  public log(event: LogEvent, errorKey: string | null = null): void {
    if (
      this.explicitOptions.localMode ||
      this.explicitOptions.disableAllLogging
    ) {
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

    this.queue.push(event.toObject());
    if (this.queue.length >= this.explicitOptions.loggingMaxBufferSize) {
      this.flush();
    }
  }

  public async flush(
    fireAndForget = false,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    this.addDiagnosticsMarkers('api_call');
    this.addDiagnosticsMarkers('get_client_initialize_response');
    if (this.queue.length === 0) {
      return Promise.resolve();
    }
    const oldQueue = this.queue;
    this.queue = [];
    const body = {
      statsigMetadata: { ...getStatsigMetadata(), sessionID: this.sessionID },
      events: oldQueue,
    };

    return this.fetcher
      .post(this.explicitOptions.api + '/log_event', body, {
        retries: fireAndForget ? 0 : this.explicitOptions.postLogsRetryLimit,
        backoff: this.explicitOptions.postLogsRetryBackoff,
        signal: abortSignal,
        compress:
          !GlobalContext.isEdgeEnvironment &&
          SDKFlags.on('stop_log_event_compression') === false,
        additionalHeaders: {
          'STATSIG-EVENT-COUNT': String(oldQueue.length),
        },
      })
      .then(() => {
        return Promise.resolve();
      })
      .catch((e) => {
        this.errorBoundary.logError(
          new Error('Log event failed'),
          StatsigContext.new({
            caller: 'statsig::log_event_failed',
            eventCount: oldQueue.length,
            bypassDedupe: true,
          }),
        );
        if (e?.name === 'AbortError') {
          OutputLogger.debug('Request to log_event aborted');
        }
        return Promise.resolve();
      });
  }

  public async shutdown(timeout?: number): Promise<void> {
    if (this.flushTimer != null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.deduperTimer != null) {
      clearInterval(this.deduperTimer);
      this.deduperTimer = null;
    }
    if (timeout != null) {
      const controller = new AbortController();
      const handle = setTimeout(() => controller.abort(), timeout);
      await this.flush(true, controller.signal);
      clearTimeout(handle);
    } else {
      await this.flush(true);
    }
  }

  public logStatsigInternal(
    user: StatsigUser | null,
    eventName: string,
    metadata: Record<string, unknown> | null,
    secondaryExposures: SecondaryExposure[] | null = null,
    value: string | number | null = null,
  ) {
    if (!this.isUniqueExposure(user, eventName, metadata)) {
      return;
    }
    const event = new LogEvent(INTERNAL_EVENT_PREFIX + eventName);
    if (user != null) {
      event.setUser(user);
    }

    if (metadata != null) {
      event.setMetadata(metadata);
    }

    if (secondaryExposures != null) {
      event.setSecondaryExposures(secondaryExposures);
    }

    if (value != null) {
      event.setValue(value);
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
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ) {
    const metadata = this.getGateExposureMetadata(
      gateName,
      evaluation,
      isManualExposure,
    );
    this.logStatsigInternal(
      user,
      GATE_EXPOSURE_EVENT,
      metadata,
      evaluation.secondary_exposures,
    );
  }

  public getGateExposureMetadata(
    gateName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      gate: gateName,
      gateValue: String(evaluation.value),
      ruleID: evaluation.rule_id,
    };

    if (evaluation.configVersion != null) {
      metadata['configVersion'] = String(evaluation.configVersion);
    }

    this.maybeAddManualExposureFlagToMetadata(metadata, isManualExposure);

    this.safeAddEvaulationDetailsToEvent(
      metadata,
      evaluation.evaluation_details,
    );
    return metadata;
  }

  public getGateExposure(
    user: StatsigUser,
    gateName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): LogEvent {
    const metadata = this.getGateExposureMetadata(
      gateName,
      evaluation,
      isManualExposure,
    );

    const event = new LogEvent(INTERNAL_EVENT_PREFIX + GATE_EXPOSURE_EVENT);
    event.setUser(user);
    event.setMetadata(metadata);
    event.setSecondaryExposures(evaluation.secondary_exposures);
    return event;
  }

  public logConfigExposure(
    user: StatsigUser,
    configName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): void {
    const metadata = this.getConfigExposureMetadata(
      configName,
      evaluation,
      isManualExposure,
    );

    this.logStatsigInternal(
      user,
      CONFIG_EXPOSURE_EVENT,
      metadata,
      evaluation.secondary_exposures,
    );
  }

  public getConfigExposure(
    user: StatsigUser,
    configName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): LogEvent {
    const event = new LogEvent(INTERNAL_EVENT_PREFIX + CONFIG_EXPOSURE_EVENT);
    event.setUser(user);
    event.setMetadata(
      this.getConfigExposureMetadata(configName, evaluation, isManualExposure),
    );
    event.setSecondaryExposures(evaluation.secondary_exposures);
    return event;
  }

  public getConfigExposureMetadata(
    configName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      config: configName,
      ruleID: evaluation.rule_id,
      rulePassed: String(evaluation.value),
    };

    if (evaluation.configVersion != null) {
      metadata['configVersion'] = String(evaluation.configVersion);
    }

    this.maybeAddManualExposureFlagToMetadata(metadata, isManualExposure);

    this.safeAddEvaulationDetailsToEvent(
      metadata,
      evaluation.evaluation_details,
    );
    return metadata;
  }

  public logLayerExposure(
    user: StatsigUser,
    layerName: string,
    parameterName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): void {
    let exposures = evaluation.undelegated_secondary_exposures;
    const isExplicit =
      evaluation.explicit_parameters?.includes(parameterName) ?? false;
    if (isExplicit) {
      exposures = evaluation.secondary_exposures;
    }
    const metadata = this.getLayerExposureMetadata(
      layerName,
      parameterName,
      evaluation,
      isManualExposure,
    );

    this.logStatsigInternal(user, LAYER_EXPOSURE_EVENT, metadata, exposures);
  }

  public getLayerExposureMetadata(
    layerName: string,
    parameterName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): Record<string, unknown> {
    let allocatedExperiment = '';
    const isExplicit =
      evaluation.explicit_parameters?.includes(parameterName) ?? false;
    if (isExplicit) {
      allocatedExperiment = evaluation.config_delegate ?? '';
    }

    const metadata: Record<string, unknown> = {
      config: layerName,
      ruleID: evaluation.rule_id,
      allocatedExperiment: allocatedExperiment,
      parameterName,
      isExplicitParameter: String(isExplicit),
    };

    if (evaluation.configVersion != null) {
      metadata['configVersion'] = String(evaluation.configVersion);
    }

    this.maybeAddManualExposureFlagToMetadata(metadata, isManualExposure);

    this.safeAddEvaulationDetailsToEvent(
      metadata,
      evaluation.evaluation_details,
    );
    return metadata;
  }

  public getLayerExposure(
    user: StatsigUser,
    layerName: string,
    parameterName: string,
    evaluation: ConfigEvaluation,
    isManualExposure: boolean,
  ): LogEvent {
    let exposures = evaluation.undelegated_secondary_exposures;
    const isExplicit =
      evaluation.explicit_parameters?.includes(parameterName) ?? false;
    if (isExplicit) {
      exposures = evaluation.secondary_exposures;
    }
    const event = new LogEvent(INTERNAL_EVENT_PREFIX + LAYER_EXPOSURE_EVENT);
    event.setMetadata(
      this.getLayerExposureMetadata(
        layerName,
        parameterName,
        evaluation,
        isManualExposure,
      ),
    );
    event.setSecondaryExposures(exposures);
    event.setUser(user);
    return event;
  }

  public logConfigDefaultValueFallback(
    user: StatsigUser,
    message: string,
    metadata: Record<string, unknown>,
  ) {
    this.logStatsigInternal(
      user,
      DEFAULT_VALUE_WARNING,
      metadata,
      null,
      message,
    );
  }

  private maybeAddManualExposureFlagToMetadata(
    metadata: Record<string, unknown>,
    isManualExposure: boolean,
  ) {
    if (!isManualExposure) {
      return;
    }

    metadata['isManualExposure'] = 'true';
  }

  private safeAddEvaulationDetailsToEvent(
    metadata: Record<string, unknown>,
    evaluationDetails?: EvaluationDetails,
  ) {
    if (!evaluationDetails) {
      return;
    }

    metadata['reason'] = evaluationDetails.reason;
    metadata['configSyncTime'] = evaluationDetails.configSyncTime;
    metadata['initTime'] = evaluationDetails.initTime;
    metadata['serverTime'] = evaluationDetails.serverTime;
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
      metadataKey = Object.entries(metadata)
        .filter(([key, _value]) => !ignoredMetadataKeys.has(key))
        .map(([_key, value]) => value)
        .join();
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

  public logDiagnosticsEvent(
    diagnostics: {
      context: string;
      markers: Marker[];
    },
    user: StatsigUser | null = null,
  ) {
    if (diagnostics.markers.length === 0 || this.explicitOptions.localMode) {
      return;
    }
    const metadata = {
      ...diagnostics,
      statsigOptions:
        diagnostics.context === 'initialize'
          ? this.optionsLoggiingCopy
          : undefined,
    };
    const event = new LogEvent(INTERNAL_EVENT_PREFIX + DIAGNOSTIC_EVENT);
    event.setDiagnosticsMetadata(metadata);
    if (user != null) {
      event.setUser(user);
    }
    this.queue.push(event.toObject());
  }

  private addDiagnosticsMarkers(
    context: 'get_client_initialize_response' | 'api_call',
  ) {
    if (Diagnostics.instance.getShouldLogDiagnostics(context)) {
      const markers = Diagnostics.instance.getMarker(context);
      this.logDiagnosticsEvent({ context, markers });
    }
    Diagnostics.instance.clearMarker(context);
  }
}

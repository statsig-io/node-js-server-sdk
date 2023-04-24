import LogEventProcessor from './LogEventProcessor';
import { DiagnosticsSamplingRate } from './SpecStore';
import { StatsigOptions } from './StatsigOptions';
import { ExhaustSwitchError } from './utils/core';

export const MAX_SAMPLING_RATE = 10000;
export interface Marker {
  key: KeyType;
  action: ActionType;
  step: StepType | null;
  value: string | number | boolean | null;
  timestamp: number;
  metadata?: MarkerMetadata;
}

export interface MarkerMetadata {
  url?: string;
}

export type ContextType = 'initialize' | 'config_sync' | 'event_logging';
export type KeyType =
  | 'download_config_specs'
  | 'bootstrap'
  | 'get_id_list'
  | 'get_id_list_sources'
  | 'overall';
export type StepType = 'process' | 'network_request';
export type ActionType = 'start' | 'end';

type DiagnosticsMarkers = {
  initialize: Marker[];
  config_sync: Marker[];
  event_logging: Marker[];
};

export default class Diagnostics {
  markers: DiagnosticsMarkers;
  private disable: boolean;
  private logger: LogEventProcessor;
  private options: StatsigOptions;

  constructor(args: {
    logger: LogEventProcessor;
    options?: StatsigOptions;
    markers?: DiagnosticsMarkers;
  }) {
    this.logger = args.logger;
    this.markers = args.markers ?? {
      initialize: [],
      config_sync: [],
      event_logging: [],
    };
    this.disable = args.options?.disableDiagnostics ?? false;
    this.options = args.options ?? {};
  }

  mark(
    context: ContextType,
    key: KeyType,
    action: ActionType,
    step?: StepType,
    value?: string | number | boolean,
    metadata?: Record<string, unknown>,
  ) {
    if (this.disable) {
      return;
    }

    const marker: Marker = {
      key,
      action,
      step: step ?? null,
      value: value ?? null,
      timestamp: Date.now(),
      metadata: metadata,
    };
    this.addMarker(context, marker);
  }

  addMarker(context: ContextType, marker: Marker) {
    this.markers[context].push(marker);
  }

  logDiagnostics(
    context: ContextType,
    optionalArgs?: {
      type: 'id_list' | 'config_spec' | 'initialize';
      samplingRates: DiagnosticsSamplingRate;
    },
  ) {
    if (this.disable) {
      return;
    }

    const shouldLog = !optionalArgs
      ? true
      : this.getShouldLogDiagnostics(
          optionalArgs.type,
          optionalArgs.samplingRates,
        );

    if (shouldLog) {
      this.logger.logDiagnosticsEvent({
        context,
        markers: this.markers[context],
        initTimeoutMs: this.options.initTimeoutMs,
      });
    }
    this.markers[context] = [];
  }

  private getShouldLogDiagnostics(
    type: 'id_list' | 'config_spec' | 'initialize',
    samplingRates: DiagnosticsSamplingRate,
  ): boolean {
    const rand = Math.random() * MAX_SAMPLING_RATE;
    switch (type) {
      case 'id_list':
        return rand < samplingRates.idlist;
      case 'config_spec':
        return rand < samplingRates.dcs;
      case 'initialize':
        return rand < samplingRates.initialize;
      default:
        throw new ExhaustSwitchError(type);
    }
  }
}

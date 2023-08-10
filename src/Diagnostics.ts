import LogEventProcessor from './LogEventProcessor';
import { DiagnosticsSamplingRate } from './SpecStore';
import { StatsigOptions } from './StatsigOptions';
import { ExhaustSwitchError } from './utils/core';

export const MAX_SAMPLING_RATE = 10000;
export interface Marker {
  key: KeyType;
  action: ActionType;
  timestamp: number;
  step?: StepType;
  statusCode?: number;
  success?: boolean;
  url?: string;
  idListCount?: number;
  reason?: 'timeout';
  sdkRegion?: string | null;
}

export type ContextType = 'initialize' | 'config_sync' | 'event_logging' | 'api_call';
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
  api_call: Marker[];
};

export class DiagnosticsImpl {
  readonly mark = {
    overall: this.selectAction<OverrallDataType>('overall'),
    downloadConfigSpecs: this.selectStep<DCSDataType>('download_config_specs'),
    bootstrap: this.selectStep<BootstrapDataType>('bootstrap'),
    getIDList: this.selectStep<GetIDListDataType>('get_id_list'),
    getIDListSources: this.selectStep<GetIdListSourcesDataType>(
      'get_id_list_sources',
    ),
  };

  private readonly markers: DiagnosticsMarkers = {
    initialize: [],
    config_sync: [],
    event_logging: [],
    api_call: [],
  };

  private disabled: boolean;
  private options: StatsigOptions;
  private logger: LogEventProcessor;
  private context: ContextType = 'initialize';

  constructor(args: {
    logger: LogEventProcessor;
    options?: StatsigOptions;
    markers?: DiagnosticsMarkers;
  }) {
    this.markers = args.markers ?? {
      initialize: [],
      config_sync: [],
      event_logging: [],
      api_call: [],
    };
    this.logger = args.logger;
    this.options = args.options ?? {};
    this.disabled = args.options?.disableDiagnostics ?? false;
  }

  setContext(context: ContextType) {
    this.context = context;
  }

  selectAction<ActionType extends RequiredStepTags>(
    key: KeyType,
    step?: StepType,
  ) {
    type StartType = ActionType['start'];
    type EndType = ActionType['end'];

    return {
      start: (data: StartType, context?: ContextType): void => {
        this.addMarker(
          {
            key,
            step,
            action: 'start',
            timestamp: Date.now(),
            ...(data ?? {}),
          },
          context,
        );
      },
      end: (data: EndType, context?: ContextType): void => {
        this.addMarker(
          {
            key,
            step,
            action: 'end',
            timestamp: Date.now(),
            ...(data ?? {}),
          },
          context,
        );
      },
    };
  }

  selectStep<StepType extends RequiredMarkerTags>(key: KeyType) {
    type ProcessStepType = StepType['process'];
    type NetworkRequestStepType = StepType['networkRequest'];

    return {
      process: this.selectAction<ProcessStepType>(key, 'process'),
      networkRequest: this.selectAction<NetworkRequestStepType>(
        key,
        'network_request',
      ),
    };
  }

  addMarker(marker: Marker, context?: ContextType) {
    if (this.disabled) {
      return;
    }
    this.markers[context ?? this.context].push(marker);
  }

  logDiagnostics(
    context: ContextType,
    optionalArgs?: {
      type: 'id_list' | 'config_spec' | 'initialize';
      samplingRates: DiagnosticsSamplingRate;
    },
  ) {
    if (this.disabled) {
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

export default abstract class Diagnostics {
  public static mark: DiagnosticsImpl['mark'];
  private static instance: DiagnosticsImpl;

  static initialize(args: {
    logger: LogEventProcessor;
    options?: StatsigOptions;
    markers?: DiagnosticsMarkers;
  }) {
    this.instance = new DiagnosticsImpl(args);
    this.mark = this.instance.mark;
  }

  static logDiagnostics(
    context: ContextType,
    optionalArgs?: {
      type: 'id_list' | 'config_spec' | 'initialize';
      samplingRates: DiagnosticsSamplingRate;
    },
  ) {
    this.instance.logDiagnostics(context, optionalArgs);
  }

  static setContext(context: ContextType) {
    this.instance.setContext(context);
  }
}

type RequiredActionTags = {
  [K in keyof Marker]?: Marker[K];
};

interface RequiredStepTags {
  start: RequiredActionTags;
  end: RequiredActionTags;
}

interface RequiredMarkerTags {
  process: RequiredStepTags;
  networkRequest: RequiredStepTags;
}

interface OverrallDataType extends RequiredStepTags {
  overall: {
    start: Record<string, never>;
    end: {
      success: boolean;
      reason?: 'timeout';
    };
  };
}

interface DCSDataType extends RequiredMarkerTags {
  process: {
    start: Record<string, never>;
    end: {
      success: boolean;
    };
  };
  networkRequest: {
    start: Record<string, never>;
    end: {
      success: boolean;
      sdkRegion?: string | null;
      statusCode?: number;
    };
  };
}

interface GetIDListDataType extends RequiredMarkerTags {
  process: {
    start: {
      url: string;
    };
    end: {
      success: boolean;
      url: string;
    };
  };
  networkRequest: {
    start: {
      url: string;
    };
    end: {
      success: boolean;
      url: string;
      statusCode?: number;
      sdkRegion?: string | null;
    };
  };
}
interface GetIdListSourcesDataType extends RequiredMarkerTags {
  process: {
    start: {
      idListCount: number;
    };
    end: {
      success: boolean;
    };
  };
  networkRequest: {
    start: Record<string, never>;
    end: {
      success: boolean;
      sdkRegion?: string | null;
      statusCode?: number;
    };
  };
}

interface BootstrapDataType extends RequiredMarkerTags {
  process: {
    start: Record<string, never>;
    end: {
      success: boolean;
    };
  };
}

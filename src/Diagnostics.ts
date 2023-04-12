import LogEventProcessor from "./LogEventProcessor";
import { StatsigOptions } from "./StatsigOptions";
import { ExhaustSwitchError } from "./utils/core";

export interface Marker {
  key: KeyType;
  action: ActionType;
  step?: string;
  value?: string | number | boolean | null;
  timestamp?: number;
}

export type contextType = 'initialize' | 'config_sync';
export type KeyType = 'download_config_specs' | 'bootstrap' | 'get_id_lists' | 'data_adapter' | 'overall';
export type ActionType = 'start' | 'end';

type DiagnosticsMarkers = {
  intialize: Marker[],
  configSync: Marker[],
  eventLogging: Marker[],
}

export default class Diagnostics {
  markers: DiagnosticsMarkers;
  private logger: LogEventProcessor;
  private disabled: boolean;

  constructor(args: {
    logger: LogEventProcessor, 
    markers?: DiagnosticsMarkers,
    options?: StatsigOptions,
  }) {
    this.logger = args.logger;
    this.markers = args.markers ?? {
      intialize: [],
      configSync: [],
      eventLogging: [],
    };
    this.disabled = args.options?.disableDiagnostics ?? false;
  }

  mark(
    context: contextType, 
    key: KeyType,
    action: ActionType,
    step?: string,
    value?: string | number | boolean,
   ) {
    const marker: Marker = {
      key,
      action,
      step,
      value,
      timestamp: Date.now(), 
    }
    switch (context){
      case 'config_sync':
        this.markers.configSync.push(marker);
        break;
      case 'initialize': 
        this.markers.intialize.push(marker);
        break;
      default:
        throw new ExhaustSwitchError(context);
    }
  }

  logDiagnostics(context: contextType) {
    if(this.disabled){
      return;
    }

    switch (context){
      case 'config_sync':
        this.logger.logDiagnosticsEvent({
          context,
          markers: this.markers.configSync
        })
        break;
      case 'initialize': 
        this.logger.logDiagnosticsEvent({
          context,
          markers: this.markers.intialize
        })
        break;
      default:
        throw new ExhaustSwitchError(context);
    }
  } 
}
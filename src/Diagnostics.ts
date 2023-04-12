import LogEventProcessor from "./LogEventProcessor";
import { StatsigOptions } from "./StatsigOptions";

interface Marker {
  key: string;
  step: string | null;
  action: string | null;
  value: string | number | boolean | null;
  timestamp: number;
}

type contextType = 'initialize' | 'config_sync';
type keysType = 'download_config_specs' | 'bootstrap' | 'get_id_lists' | 'data_adapter' | 'overall';
type actionType = 'start' | 'end';

export default class Diagnostics {
  context: contextType;
  markers: Marker[];
  private logger: LogEventProcessor;
  private disabled: boolean = false;

  constructor(args: {
    context: contextType, 
    logger: LogEventProcessor, 
    markers?: Marker[],
    options?: StatsigOptions,
  }) {
    this.context = args.context;
    this.logger = args.logger;
    this.markers = args.markers ?? [];
    this.disabled = args.options?.disableDiagnostics ?? false;
  }

  mark(
    key: keysType,
    action: actionType,
    step?: string,
    value?: string | number | boolean,
  ) {
    if(this.disabled){
      return;
    }
    const marker = {
      key: key,
      action: action,
      step: step ?? null,
      value: value ?? null,
      timestamp: Date.now(),
    };
    this.markers.push(marker);
  }

  setContext(context: contextType){
    this.context = context
  }

  serialize() {
    return {
      context: this.context,
      markers: this.markers,
    };
  }

  logDiagnostics() {
    if(this.disabled){
      return;
    }
    this.logger.logDiagnosticsEvent(this)
  } 
}

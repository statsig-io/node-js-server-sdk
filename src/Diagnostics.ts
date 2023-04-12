import LogEventProcessor from "./LogEventProcessor";

interface Marker {
  key: string;
  step: string | null;
  action: string | null;
  value: string | number | boolean | null;
  timestamp: number;
}

export default class Diagnostics {
  context: string;
  markers: Marker[];
  private logger: LogEventProcessor;
  private disabled: boolean = false;

  constructor(context: string, logger: LogEventProcessor, markers: Marker[] = []) {
    this.context = context;
    this.logger = logger;
    this.markers = markers;
  }

  mark(
    key: string,
    action: string,
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

  disable(){
    this.disabled = true;
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

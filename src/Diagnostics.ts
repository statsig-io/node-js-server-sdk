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

  constructor(context: string, markers: Marker[] = []) {
    this.context = context;
    this.markers = markers;
  }

  mark(
    key: string,
    action: string,
    step?: string,
    value?: string | number | boolean,
  ) {
    const marker = {
      key: key,
      action: action,
      step: step ?? null,
      value: value ?? null,
      timestamp: Date.now(),
    };
    this.markers.push(marker);
  }

  serialize() {
    return {
      context: this.context,
      markers: this.markers,
    };
  }
}

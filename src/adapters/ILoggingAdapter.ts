import LogEvent from "../LogEvent";

export interface ILoggingAdapter {
  getQueuedEvents(): LogEvent[];
  enqueueEvents(events: LogEvent[]): void;
  flushQueuedEvents(): void;
}
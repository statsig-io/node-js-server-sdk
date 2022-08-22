import { ConfigSpec } from "../ConfigSpec";

type mixed = object | string | number;

export interface ILoggingAdapter {
  enqueueEvents(events: mixed[]): void;
  getQueuedEvents(): mixed[];
}
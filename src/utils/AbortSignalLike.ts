// Workaround for runtimes that don't support AbortSignal
export type SignalType<T extends object> = 'signal' extends keyof T
  ? NonNullable<T['signal']>
  : any;
export type AbortSignalLike = SignalType<RequestInit>;

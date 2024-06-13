interface Context {
  caller?: string;
  configName?: string;
  clientKey?: string;
  hash?: string;
  eventCount?: number;
  bypassDedupe?: boolean;
  targetAppID?: string;
}

export default class StatsigContext {
  readonly caller?: string;
  readonly eventCount?: number;
  readonly configName?: string;
  readonly clientKey?: string;
  readonly hash?: string;
  readonly bypassDedupe?: boolean;
  readonly targetAppID?: string;

  private constructor(protected ctx: Context) {
    this.caller = ctx.caller;
    this.eventCount = ctx.eventCount;
    this.configName = ctx.configName;
    this.clientKey = ctx.clientKey;
    this.hash = ctx.clientKey;
    this.bypassDedupe = ctx.bypassDedupe;
    this.targetAppID = ctx.targetAppID;
  }

  static new(ctx: Context): StatsigContext {
    return new this(ctx);
  }

  // Create a new context to avoid modifying context up the stack
  public withTargetAppID(targetAppID: string): StatsigContext {
    return StatsigContext.new({ ...this.ctx, targetAppID });
  }

  getContextForLogging(): object {
    return {
      tag: this.caller,
      eventCount: this.eventCount,
      configName: this.configName,
      clientKey: this.clientKey,
      hash: this.clientKey,
    };
  }
}

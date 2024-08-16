import { ConfigSpec } from '../ConfigSpec';
import { UserPersistedValues } from '../interfaces/IUserPersistentStorage';
import { StatsigUser } from '../StatsigUser';

type Context = {
  caller?: string;
  configName?: string;
  clientKey?: string;
  hash?: string;
  eventCount?: number;
  bypassDedupe?: boolean;
  targetAppID?: string;
  user?: StatsigUser;
  spec?: ConfigSpec;
  userPersistedValues?: UserPersistedValues | null;
};

export class StatsigContext {
  readonly caller?: string;
  readonly eventCount?: number;
  readonly configName?: string;
  readonly clientKey?: string;
  readonly hash?: string;
  readonly bypassDedupe?: boolean;
  readonly userPersistedValues?: UserPersistedValues | null;

  protected constructor(protected ctx: Context) {
    this.caller = ctx.caller;
    this.eventCount = ctx.eventCount;
    this.configName = ctx.configName;
    this.clientKey = ctx.clientKey;
    this.hash = ctx.clientKey;
    this.bypassDedupe = ctx.bypassDedupe;
    this.userPersistedValues = ctx.userPersistedValues;
  }

  // Create a new context to avoid modifying context up the stack
  static new(ctx: Context): StatsigContext {
    return new this(ctx);
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

  getRequestContext(): Context {
    return this.ctx;
  }
}

export class EvaluationContext extends StatsigContext {
  readonly user: StatsigUser;
  readonly spec: ConfigSpec;
  readonly targetAppID?: string;

  protected constructor(
    ctx: Context,
    user: StatsigUser,
    spec: ConfigSpec,
    targetAppID?: string,
  ) {
    super(ctx);
    this.user = user;
    this.spec = spec;
    this.targetAppID = targetAppID;
  }

  public static new(
    ctx: Context & Required<Pick<Context, 'user' | 'spec'>>,
  ): EvaluationContext {
    const { user, spec, ...optionalCtx } = ctx;
    return new this(optionalCtx, user, spec);
  }

  public static get(
    ctx: Context,
    evalCtx: {
      user: StatsigUser;
      spec: ConfigSpec;
      targetAppID?: string;
    },
  ): EvaluationContext {
    return new EvaluationContext(
      ctx,
      evalCtx.user,
      evalCtx.spec,
      evalCtx.targetAppID,
    );
  }

  public withTargetAppID(targetAppID: string): EvaluationContext {
    return new EvaluationContext(
      this.getRequestContext(),
      this.user,
      this.spec,
      targetAppID,
    );
  }
}

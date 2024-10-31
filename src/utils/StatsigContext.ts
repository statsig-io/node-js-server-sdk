import { ConfigSpec } from '../ConfigSpec';
import {
  InitializationDetails,
  InitializationSource,
} from '../InitializationDetails';
import { UserPersistedValues } from '../interfaces/IUserPersistentStorage';
import { PersistentAssignmentOptions } from '../StatsigOptions';
import { StatsigUser } from '../StatsigUser';

type RequestContext = {
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
  persistentAssignmentOptions?: PersistentAssignmentOptions;
};

export class StatsigContext {
  readonly startTime: number;
  readonly caller?: string;
  readonly eventCount?: number;
  readonly configName?: string;
  readonly clientKey?: string;
  readonly hash?: string;
  readonly bypassDedupe?: boolean;
  readonly userPersistedValues?: UserPersistedValues | null;
  readonly persistentAssignmentOptions?: PersistentAssignmentOptions;

  protected constructor(protected ctx: RequestContext) {
    this.startTime = Date.now();
    this.caller = ctx.caller;
    this.eventCount = ctx.eventCount;
    this.configName = ctx.configName;
    this.clientKey = ctx.clientKey;
    this.hash = ctx.clientKey;
    this.bypassDedupe = ctx.bypassDedupe;
    this.userPersistedValues = ctx.userPersistedValues;
    this.persistentAssignmentOptions = ctx.persistentAssignmentOptions;
  }

  // Create a new context to avoid modifying context up the stack
  static new(ctx: RequestContext): StatsigContext {
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

  getRequestContext(): RequestContext {
    return this.ctx;
  }
}

export class EvaluationContext extends StatsigContext {
  readonly user: StatsigUser;
  readonly spec: ConfigSpec;
  readonly targetAppID?: string;
  readonly onlyEvaluateTargeting?: boolean;

  protected constructor(
    ctx: RequestContext,
    user: StatsigUser,
    spec: ConfigSpec,
    targetAppID?: string,
    onlyEvaluateTargeting?: boolean,
  ) {
    super(ctx);
    this.user = user;
    this.spec = spec;
    this.targetAppID = targetAppID;
    this.onlyEvaluateTargeting = onlyEvaluateTargeting;
  }

  public static new(
    ctx: RequestContext & Required<Pick<RequestContext, 'user' | 'spec'>>,
  ): EvaluationContext {
    const { user, spec, ...optionalCtx } = ctx;
    return new this(optionalCtx, user, spec);
  }

  public static get(
    ctx: RequestContext,
    evalCtx: {
      user: StatsigUser;
      spec: ConfigSpec;
      targetAppID?: string;
      onlyEvaluateTargeting?: boolean;
    },
  ): EvaluationContext {
    return new EvaluationContext(
      ctx,
      evalCtx.user,
      evalCtx.spec,
      evalCtx.targetAppID,
      evalCtx.onlyEvaluateTargeting,
    );
  }
}

export class InitializeContext extends StatsigContext {
  readonly sdkKey: string;
  private success: boolean;
  private error?: Error;
  private source?: InitializationSource;

  protected constructor(ctx: RequestContext, sdkKey: string) {
    super(ctx);
    this.sdkKey = sdkKey;
    this.success = true;
  }

  public static new(
    ctx: RequestContext & {
      sdkKey: string;
    },
  ): InitializeContext {
    return new this(ctx, ctx.sdkKey);
  }

  public setSuccess(source: InitializationSource): void {
    this.success = true;
    this.source = source;
  }

  public setFailed(error?: Error): void {
    this.success = false;
    this.error = error;
  }

  public getInitDetails(): InitializationDetails {
    return {
      duration: Date.now() - this.startTime,
      success: this.success,
      error: this.error,
      source: this.source,
    };
  }
}

export class GlobalContext {
  // @ts-ignore
  static isEdgeEnvironment = typeof EdgeRuntime === 'string';
}

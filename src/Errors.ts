export class StatsigUninitializedError extends Error {
  constructor() {
    super('Call and wait for initialize() to finish first.');

    Object.setPrototypeOf(this, StatsigUninitializedError.prototype);
  }
}

export class StatsigInvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, StatsigInvalidArgumentError.prototype);
  }
}

export class StatsigTooManyRequestsError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, StatsigTooManyRequestsError.prototype);
  }
}

export class StatsigLocalModeNetworkError extends Error {
  constructor() {
    super('No network requests in localMode');

    Object.setPrototypeOf(this, StatsigLocalModeNetworkError.prototype);
  }
}

export class StatsigInitializeFromNetworkError extends Error {
  constructor() {
    super('statsigSDK::initialize> Failed to initialize from the network. See https://docs.statsig.com/messages/serverSDKConnection for more information');

    Object.setPrototypeOf(this, StatsigInitializeFromNetworkError.prototype);
  }
}

export class StatsigInvalidBootstrapValuesError extends Error {
  constructor() {
    super('statsigSDK::initialize> the provided bootstrapValues is not a valid JSON string.');

    Object.setPrototypeOf(this, StatsigInvalidBootstrapValuesError.prototype);
  }
}

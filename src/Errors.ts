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
  constructor(error?: Error) {
    super(
      `statsigSDK::initialize> Failed to initialize from the network${
        error ? `: ${error.message}` : ''
      }. See https://docs.statsig.com/messages/serverSDKConnection for more information`,
    );

    Object.setPrototypeOf(this, StatsigInitializeFromNetworkError.prototype);
  }
}

export class StatsigInitializeIDListsError extends Error {
  constructor(error?: Error) {
    super(
      `statsigSDK::initialize> Failed to initialize id lists${
        error ? `: ${error.message}` : ''
      }.`,
    );

    Object.setPrototypeOf(this, StatsigInitializeFromNetworkError.prototype);
  }
}

export class StatsigInvalidBootstrapValuesError extends Error {
  constructor() {
    super(
      'statsigSDK::initialize> the provided bootstrapValues is not a valid JSON string.',
    );

    Object.setPrototypeOf(this, StatsigInvalidBootstrapValuesError.prototype);
  }
}

export class StatsigInvalidDataAdapterValuesError extends Error {
  constructor(key: string) {
    super(
      `statsigSDK::dataAdapter> Failed to retrieve valid values for ${key}) from the provided data adapter`,
    );

    Object.setPrototypeOf(this, StatsigInvalidDataAdapterValuesError.prototype);
  }
}

export class StatsigInvalidIDListsResponseError extends Error {
  constructor() {
    super(
      'statsigSDK::dataAdapter> Failed to retrieve a valid ID lists response from network',
    );

    Object.setPrototypeOf(this, StatsigInvalidIDListsResponseError.prototype);
  }
}

export class StatsigInvalidConfigSpecsResponseError extends Error {
  constructor() {
    super(
      'statsigSDK::dataAdapter> Failed to retrieve a valid config specs response from network',
    );

    Object.setPrototypeOf(
      this,
      StatsigInvalidConfigSpecsResponseError.prototype,
    );
  }
}

export class StatsigSDKKeyMismatchError extends Error {
  constructor() {
    super(
      'statsigSDK::initialize> SDK key provided in initialize() does not match the one used to generate initialize reponse.',
    );

    Object.setPrototypeOf(this, StatsigSDKKeyMismatchError.prototype);
  }
}

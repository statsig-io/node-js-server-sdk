export class StatsigUninitializedError extends Error {
  constructor() {
    super('Call and wait for initialize() to finish first.');
  }
}

export class StatsigInvalidArgumentError extends Error {}
export class StatsigTooManyRequestsError extends Error {}

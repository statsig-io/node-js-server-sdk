const { clone } = require('./utils/core');

class LogEvent {
  constructor(eventName) {
    if (eventName == null || typeof eventName !== 'string') {
      console.error('statsigSDK> EventName needs to be a string.');
      eventName = 'invalid_event';
    }
    this.time = Date.now();
    this.eventName = eventName;
  }

  setUser(user) {
    if (user != null && typeof user !== 'object') {
      console.warn(
        'statsigSDK> User is not set because it needs to be an object.',
      );
      return;
    }
    this.user = clone(user);
  }

  setValue(value) {
    if (typeof value === 'object') {
      this.value = JSON.stringify(value);
    } else if (typeof value === 'number') {
      this.value = value;
    } else {
      this.value = value.toString();
    }
  }

  setMetadata(metadata) {
    if (metadata != null && typeof metadata !== 'object') {
      console.warn(
        'statsigSDK> Metadata is not set because it needs to be an object.',
      );
      return;
    }
    this.metadata = clone(metadata);
  }

  setTime(time) {
    if (time != null && typeof time !== 'number') {
      console.warn(
        'statsigSDK>Timestamp is not set because it needs to be a number.',
      );
      return;
    }
    this.time = time;
  }

  validate() {
    return typeof this.eventName === 'string' && this.eventName.length > 0;
  }

  toObject() {
    return {
      eventName: this.eventName,
      metadata: this.metadata,
      time: this.time,
      user: this.user,
      value: this.value,
    };
  }
}

module.exports = LogEvent;

import { ConfigSpecs, IConfigAdapter } from './IConfigAdapter';
import * as redis from 'redis';
import { RedisClientOptions } from 'redis';

export default class RedisConfigAdapter implements IConfigAdapter {
  private client;

  public constructor(hostname: string, port?: number, password?: string) {
    const options: RedisClientOptions = {
      socket: {
        host: hostname,
        port: port,
      },
      password: password
    };
    this.client = redis.createClient(options);
  }

  public async getConfigSpecs(): Promise<ConfigSpecs | null> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    const obj = await this.client.hGetAll('config-specs');
    if (obj === null) {
      return null;
    }

    const result: {[key: string]: any} = {};
    for (const key in obj) {
      if (Object.hasOwnProperty.call(obj, key)) {
        result[key] = JSON.parse(obj[key]);
      }
    }
    return result as ConfigSpecs;
  }

  public async setConfigSpecs(configSpecs: ConfigSpecs): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    const multi = this.client.multi();
    multi.hSet('config-specs', 'gates', JSON.stringify(configSpecs.gates));
    multi.hSet('config-specs', 'configs', JSON.stringify(configSpecs.configs));
    multi.hSet('config-specs', 'layers', JSON.stringify(configSpecs.layers));
    multi.hSet(
      'config-specs',
      'experimentToLayer',
      JSON.stringify(configSpecs.experimentToLayer),
    );
    multi.hSet('config-specs', 'time', configSpecs.time);
    await multi.exec();
  }

  public async shutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  public clearCache(): void {
    if (this.client.isOpen) {
      this.client.flushAll();
    }
  }
}
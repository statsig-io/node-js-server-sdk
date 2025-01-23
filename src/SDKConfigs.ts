export default abstract class SDKConfigs {
  private static _configs: Record<string, unknown> = {};

  static setConfigs(newConfigs: unknown) {
    const typedConfigs =
      newConfigs && typeof newConfigs === 'object' ? newConfigs : {};
    this._configs = typedConfigs as Record<string, unknown>;
  }

  static get(key: string): unknown {
    return this._configs[key];
  }
}

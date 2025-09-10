export class SDKConfigs {
  private static _flags: Record<string, boolean> = {};
  private static _configs: Record<string, unknown> = {};

  static setFlags(newFlags: Record<string, boolean>): void {
    const typedFlags = newFlags && typeof newFlags === 'object' ? newFlags : {};
    SDKConfigs._flags = typedFlags;
  }

  static setConfigs(newConfigs: Record<string, unknown>): void {
    const typedConfigs =
      newConfigs && typeof newConfigs === 'object' ? newConfigs : {};
    SDKConfigs._configs = typedConfigs;
  }

  static on(key: string): boolean {
    return SDKConfigs._flags[key] === true;
  }

  static getConfigNumValue(config: string): number | null {
    const value = SDKConfigs._configs[config];
    if (typeof value === 'number') {
      return value;
    }
    return null;
  }

  static getConfigIntValue(config: string): number | null {
    const value = SDKConfigs._configs[config];
    if (typeof value === 'number') {
      return Math.floor(value);
    }
    return null;
  }

  static getConfigStrValue(config: string): string | null {
    const value = SDKConfigs._configs[config];
    if (typeof value === 'string') {
      return value;
    }
    return null;
  }
}

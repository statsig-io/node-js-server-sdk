export default abstract class SDKFlags {
  private static _flags: Record<string, unknown> = {};

  static setFlags(newFlags: unknown) {
    const typedFlags = newFlags && typeof newFlags === 'object' ? newFlags : {};
    this._flags = typedFlags as Record<string, unknown>;
  }

  static on(key: string): boolean {
    return this._flags[key] === true;
  }
}

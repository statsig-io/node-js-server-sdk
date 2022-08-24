import { ConfigSpec } from "../ConfigSpec";

export type ConfigSpecs = {
  gates: Record<string, ConfigSpec>,
  configs: Record<string, ConfigSpec>,
  layers: Record<string, ConfigSpec>,
  experimentToLayer: Record<string, string>,
  time: number,
};

export interface IConfigAdapter {
  getConfigSpecs(): Promise<ConfigSpecs | null>;
  setConfigSpecs(configSpecs: ConfigSpecs): Promise<void>;
  shutdown?(): Promise<void>;
}
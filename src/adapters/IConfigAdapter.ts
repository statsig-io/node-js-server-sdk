import { ConfigSpec } from "../ConfigSpec";

type ConfigSpecs = {
  gates: Record<string, ConfigSpec>,
  configs: Record<string, ConfigSpec>,
  layers: Record<string, ConfigSpec>,
  experimentToLayer: Record<string, string>,
  time: number,
};

export interface IConfigAdapter {
  getConfigSpecs(): ConfigSpecs | null;
  setConfigSpecs(configSpecs: ConfigSpecs): void;
}
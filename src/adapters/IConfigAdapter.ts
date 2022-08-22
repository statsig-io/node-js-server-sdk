import { ConfigSpec } from "../ConfigSpec";

export interface IConfigAdapter {
  getConfigSpecs(): ConfigSpec | null;
  updateConfigSpecs(specs: ConfigSpec): void;
}
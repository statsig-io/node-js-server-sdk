export default class ConfigEvaluation {
  public value: boolean;
  public rule_id: string;
  public secondary_exposures: Record<string, string>[];
  public json_value: Record<string, unknown> | boolean;
  public explicit_parameters: string[] | undefined;
  public config_delegate: string | undefined;
  public fetch_from_server: boolean;
  public undelegated_secondary_exposures: Record<string, string>[] | undefined;

  constructor(
    value,
    rule_id = '',
    secondary_exposures = [],
    json_value = null,
    explicit_parameters = undefined,
    config_delegate = undefined,
    fetch_from_server = false,
    undelegated_secondary_exposures = [],
  ) {
    this.value = value;
    this.rule_id = rule_id;
    this.json_value = json_value;
    this.secondary_exposures = secondary_exposures;
    this.undelegated_secondary_exposures = undelegated_secondary_exposures;
    this.config_delegate = config_delegate;
    this.fetch_from_server = fetch_from_server;
    this.explicit_parameters = explicit_parameters;
  }

  public static fetchFromServer() {
    return new ConfigEvaluation(false, '', [], null, null, null, true);
  }
}

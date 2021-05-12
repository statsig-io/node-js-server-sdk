// @ts-nocheck
global.console = {
  log: console.log, // console.log are kept in tests for debugging

  // Mock other console functions so they don't pollute the console when running test
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

const mock_gateSpec = {
  name: 'nfl_gate',
  type: 'feature_gate',
  salt: 'na',
  defaultValue: false,
  enabled: true,
  rules: [
    {
      name: 'employees',
      id: 'rule_id_gate',
      passPercentage: 100,
      conditions: [
        {
          type: 'user_field',
          targetValue: ['packers.com', 'nfl.com'],
          operator: 'str_contains_any',
          field: 'email',
        },
      ],
      returnValue: true,
    },
  ],
};

const mock_halfPassGateSpec = {
  name: 'nfl_gate2',
  type: 'feature_gate',
  salt: 'na',
  defaultValue: false,
  enabled: true,
  rules: [
    {
      name: 'employees',
      id: 'test',
      passPercentage: 50,
      conditions: [
        {
          type: 'user_field',
          targetValue: ['packers.com', 'nfl.com'],
          operator: 'str_contains_any',
          field: 'email',
        },
      ],
      returnValue: true,
    },
  ],
};

const mock_disabledGateSpec = {
  name: 'nfl_gate3',
  type: 'feature_gate',
  salt: 'na',
  defaultValue: false,
  enabled: false,
  rules: [
    {
      name: 'employees',
      id: 'rule_id_disabled_gate',
      passPercentage: 100,
      conditions: [
        {
          type: 'user_field',
          targetValue: ['packers.com', 'nfl.com'],
          operator: 'str_contains_any',
          field: 'email',
        },
      ],
      returnValue: true,
    },
  ],
};

const mock_dynamicConfigSpec = {
  name: 'teams',
  type: 'dynamic_config',
  salt: 'sodium',
  defaultValue: {
    test: 'default',
  },
  enabled: true,
  rules: [
    {
      name: 'can see teams',
      passPercentage: 100,
      id: 'rule_id_config',
      conditions: [
        {
          type: 'user_field',
          targetValue: 9,
          operator: 'gte',
          field: 'level',
        },
      ],
      returnValue: {
        packers: {
          name: 'Green Bay Packers',
          yearFounded: 1919,
        },
        seahawks: {
          name: 'Seattle Seahawks',
          yearFounded: 1974,
        },
      },
    },
    {
      name: 'public',
      id: 'rule_id_config_public',
      passPercentage: 100,
      conditions: [
        {
          type: 'public',
        },
      ],
      returnValue: {},
    },
  ],
};

const exampleConfigSpecs = {
  gate: mock_gateSpec,
  half_pass_gate: mock_halfPassGateSpec,
  disabled_gate: mock_disabledGateSpec,
  config: mock_dynamicConfigSpec,
};

module.exports = exampleConfigSpecs;

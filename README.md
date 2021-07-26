# Statsig

[![npm version](https://badge.fury.io/js/statsig-node.svg)](https://badge.fury.io/js/statsig-node) [![tests](https://github.com/statsig-io/private-node-js-server-sdk/actions/workflows/tests.yml/badge.svg)](https://github.com/statsig-io/private-node-js-server-sdk/actions/workflows/tests.yml)

## Statsig Node Server SDK

The nodejs SDK for server environments. If you're looking for a javascript client SDK, try [https://github.com/statsig-io/js-client-sdk](https://github.com/statsig-io/js-client-sdk).

Statsig helps you move faster with Feature Gates (Feature Flags) and Dynamic Configs. It also allows you to run A/B tests to validate your new features and understand their impact on your KPIs. If you're new to Statsig, create an account at [statsig.com](https://www.statsig.com).

## Testing

Each server SDK is tested at multiple levels - from unit to integration and e2e tests. Our internal e2e test harness runs daily against each server SDK, while unit and integration tests can be seen in the respective github repos of each SDK. For node, the `RulesetsEvalConsistency.test.js` runs a validation test on local rule/condition evaluation for node against the results in the statsig backend.

## Getting Started

Visit our [getting started guide](https://docs.statsig.com/server/nodejsServerSDK), or check out the [SDK Documentation](https://github.com/statsig-io/node-js-server-sdk/blob/main/docs/README.md)

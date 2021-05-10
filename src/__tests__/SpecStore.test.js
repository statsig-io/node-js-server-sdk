const SpecStore = require('../SpecStore');
describe('Testing SpecStore behavior', () => {
  jest.spyOn(SpecStore, 'checkGate').mockImplementation((user, gateName) => {
    if (gateName === 'gate_pass') return true;
    if (gateName === 'gate_server') return FETCH_FROM_SERVER;
    return false;
  });
  jest.spyOn(SpecStore, 'ip2country').mockImplementation((ip) => 'US');

  it('', () => {
    params.forEach((p) => {
      let json = {
        type: p[0],
        operator: p[1],
        targetValue: p[2],
        field: p[3],
      };
      const condition = new ConfigCondition(json);
      expect(condition.evaluate(p[4])).toEqual(p[5]);
    });
  });
});

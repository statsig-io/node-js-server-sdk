const getUser = require('../getUser');

jest.mock('../getUser');

it('Should return John Doe', async () => {
  let response = await getUser();
  console.log('response :>> ', response);
  expect(response).toStrictEqual({
    user: { firstName: 'John', lastName: 'Doe' },
  });
});

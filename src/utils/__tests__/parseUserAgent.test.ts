import parseUserAgent from '../parseUserAgent';

const mockUAParser = jest.fn();
jest.mock('ua-parser-js', () => ({
  __esModule: true,
  default: (uaString: string) => mockUAParser(uaString),
}));

describe('parseUserAgent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the parsed user agent', () => {
    const uaString =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

    const mockRes = {
      ua: uaString,
      browser: { name: 'Chrome', version: '129.0.0.0', major: '129' },
      engine: { name: 'Blink', version: '129.0.0.0' },
      os: { name: 'Windows', version: '10' },
      device: { vendor: undefined, model: undefined, type: undefined },
      cpu: { architecture: 'amd64' },
    };
    mockUAParser.mockReturnValue(mockRes);

    expect(parseUserAgent(uaString)).toEqual(mockRes);
  });

  it('replaces "Mac OS" with "Mac OS X"', () => {
    const uaString =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

    mockUAParser.mockReturnValue({
      ua: uaString,
      browser: { name: 'Chrome', version: '129.0.0.0', major: '129' },
      engine: { name: 'Blink', version: '129.0.0.0' },
      os: { name: 'Mac OS', version: '10.15.7' },
      device: { vendor: 'Apple', model: 'Macintosh', type: undefined },
      cpu: { architecture: undefined },
    });

    expect(parseUserAgent(uaString).os.name).toEqual('Mac OS X');
  });

  it('adds "Mobile" to mobile browser names', () => {
    const uaString =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';

    mockUAParser.mockReturnValue({
      ua: uaString,
      browser: { name: 'Chrome', version: '116.0.0.0', major: '116' },
      engine: { name: 'Blink', version: '116.0.0.0' },
      os: { name: 'Android', version: '13' },
      device: { vendor: 'Google', model: 'Pixel 7', type: 'mobile' },
      cpu: { architecture: undefined },
    });

    expect(parseUserAgent(uaString).browser.name).toEqual('Chrome Mobile');
  });

  it('memoizes the most recent call', () => {
    const uaString =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

    const mockRes = {
      ua: uaString,
      browser: { name: 'Chrome', version: '129.0.0.0', major: '129' },
      engine: { name: 'Blink', version: '129.0.0.0' },
      os: { name: 'Windows', version: '10' },
      device: { vendor: undefined, model: undefined, type: undefined },
      cpu: { architecture: 'amd64' },
    };
    mockUAParser.mockReturnValue(mockRes);

    parseUserAgent(uaString);
    parseUserAgent(uaString);
    parseUserAgent(uaString);

    expect(mockUAParser).toHaveBeenCalledTimes(1);
  });
});

import uaparser from 'ua-parser-js';

// Memoize the most recent call
const parseUserAgentMemo:
  | { uaString: undefined; res: undefined }
  | { uaString: string; res: uaparser.IResult } = {
  uaString: undefined,
  res: undefined,
};

// This exists only to provide compatibility for useragent library that's used
// everywhere else.
export default function parseUserAgent(uaString: string) {
  if (parseUserAgentMemo.uaString === uaString) {
    return parseUserAgentMemo.res;
  }

  const res = uaparser(uaString);
  if (res.os.name === 'Mac OS') {
    res.os.name = 'Mac OS X';
  }
  if (
    (res.browser.name === 'Chrome' || res.browser.name === 'Firefox') &&
    (res.device.type === 'mobile' || res.device.type === 'tablet')
  ) {
    res.browser.name += ' Mobile';
  }

  parseUserAgentMemo.uaString = uaString;
  parseUserAgentMemo.res = res;

  return res;
}

import { describe, expect, it } from 'vitest';
import { detectPlatform, isInAppBrowser } from '../../src/app/install';

const UA = {
  samsungChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  instagramIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0;]',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

describe('install help', () => {
  it('knows which phone it is on', () => {
    expect(detectPlatform(UA.samsungChrome)).toBe('android');
    expect(detectPlatform(UA.iphoneSafari)).toBe('ios');
    expect(detectPlatform(UA.ipadOS, 5)).toBe('ios'); // iPad pretending to be a Mac
    expect(detectPlatform(UA.ipadOS, 0)).toBe('other'); // a real Mac
    expect(detectPlatform(UA.windowsChrome)).toBe('other');
  });

  it('spots browsers inside other apps, which cannot install', () => {
    expect(isInAppBrowser(UA.instagramIphone)).toBe(true);
    expect(isInAppBrowser(UA.facebookAndroid)).toBe(true);
    expect(isInAppBrowser(UA.samsungChrome)).toBe(false);
    expect(isInAppBrowser(UA.iphoneSafari)).toBe(false);
  });
});

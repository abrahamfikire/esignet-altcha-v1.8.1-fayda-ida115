import { getCaptchaChallengeUrl, getCaptchaProvider } from './captchaConfig';

const configuration = (values) => ({
  getEsignetConfiguration: (key) => values[key],
});

describe('captcha configuration', () => {
  test('keeps legacy provider as the fallback', () => {
    expect(getCaptchaProvider(configuration({}))).toBe('legacy');
  });

  test('uses configured ALTCHA provider and challenge endpoint', () => {
    const service = configuration({
      'captcha.provider': ' ALTCHA ',
      'captcha.challengeUrl': '/custom/challenge',
    });

    expect(getCaptchaProvider(service)).toBe('altcha');
    expect(getCaptchaChallengeUrl(service)).toBe(
      `${window.location.origin}${process.env.REACT_APP_ESIGNET_API_URL || ''}/custom/challenge`
    );
  });
});

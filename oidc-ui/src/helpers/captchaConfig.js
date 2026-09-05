import { configurationKeys } from '../constants/clientConstants';

const ALTCHA_CHALLENGE_PATH = '/authorization/altcha/challenge';

export const getCaptchaProvider = (openIDConnectService) =>
  (
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.captchaProvider
    ) ||
    process.env.REACT_APP_CAPTCHA_PROVIDER ||
    'legacy'
  )
    .trim()
    .toLowerCase();

const getApiBaseUrl = () => {
  const configuredApiUrl = process.env.REACT_APP_ESIGNET_API_URL || '';
  if (/^https?:\/\//i.test(configuredApiUrl)) {
    return configuredApiUrl.replace(/\/+$/, '');
  }
  return `${window.location.origin}${configuredApiUrl}`.replace(/\/+$/, '');
};

export const getCaptchaChallengeUrl = (openIDConnectService) => {
  const configuredUrl =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.captchaChallengeUrl
    ) ?? process.env.REACT_APP_CAPTCHA_CHALLENGE_URL;

  if (configuredUrl && /^https?:\/\//i.test(configuredUrl)) {
    return configuredUrl;
  }

  const apiBaseUrl = getApiBaseUrl();
  if (configuredUrl?.startsWith('/')) {
    return `${apiBaseUrl}${configuredUrl}`;
  }
  return `${apiBaseUrl}${ALTCHA_CHALLENGE_PATH}`;
};

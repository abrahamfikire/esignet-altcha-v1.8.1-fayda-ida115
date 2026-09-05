import { useEffect, useRef } from 'react';

const ALTCHA_CHALLENGE_PATH = '/authorization/altcha/challenge';

function resolveChallengeUrl(challengeUrl) {
  if (challengeUrl && /^https?:\/\//i.test(challengeUrl)) {
    return challengeUrl;
  }

  const configuredApiUrl = process.env.REACT_APP_ESIGNET_API_URL || '';
  const apiBaseUrl = /^https?:\/\//i.test(configuredApiUrl)
    ? configuredApiUrl
    : `${window.location.origin}${configuredApiUrl}`;
  const base = apiBaseUrl.replace(/\/+$/, '');

  if (challengeUrl?.startsWith('/')) {
    return `${base}${challengeUrl}`;
  }
  return `${base}${ALTCHA_CHALLENGE_PATH}`;
}

export default function AltchaWidget({
  challengeUrl,
  language = 'en',
  onVerified,
  widgetKey,
}) {
  const widgetRef = useRef(null);
  const resolvedChallengeUrl = resolveChallengeUrl(challengeUrl);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return undefined;
    }

    widget.setAttribute('challenge', resolvedChallengeUrl);
    widget.setAttribute('challengeurl', resolvedChallengeUrl);
    widget.setAttribute('language', language);
    if (typeof widget.configure === 'function') {
      widget.configure({
        challenge: resolvedChallengeUrl,
        language,
      });
    }

    const handleStateChange = (event) => {
      const { state, payload } = event.detail ?? {};
      if (state === 'verified' && payload) {
        onVerified(payload);
      } else if (state !== 'verifying') {
        onVerified(null);
      }
    };

    widget.addEventListener('statechange', handleStateChange);
    return () => widget.removeEventListener('statechange', handleStateChange);
  }, [language, onVerified, resolvedChallengeUrl, widgetKey]);

  return (
    <altcha-widget
      key={widgetKey}
      ref={widgetRef}
      challenge={resolvedChallengeUrl}
      challengeurl={resolvedChallengeUrl}
      language={language}
    />
  );
}

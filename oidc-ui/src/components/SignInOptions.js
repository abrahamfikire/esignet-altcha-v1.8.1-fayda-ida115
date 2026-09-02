import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingIndicator from '../common/LoadingIndicator';
import { configurationKeys } from '../constants/clientConstants';
import { LoadingStates as states } from '../constants/states';
import { getAllAuthFactors } from '../services/walletService';
import Tooltip from './tooltip';

const ChevronRight = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#9ca3af"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const InfoIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </svg>
);

const resolveAssetUrl = (path) =>
  `${process.env.PUBLIC_URL || ''}${path.startsWith('/') ? path : `/${path}`}`;

export default function SignInOptions({
  openIDConnectService,
  handleSignInOptionClick,
  i18nKeyPrefix = 'signInOption',
  icons,
  authLabel,
}) {
  const { t } = useTranslation('translation', { keyPrefix: i18nKeyPrefix });

  const [status, setStatus] = useState({ state: states.LOADED, msg: '' });
  const [singinOptions, setSinginOptions] = useState(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  useEffect(() => {
    setStatus({ state: states.LOADING, msg: 'loading_msg' });

    let oAuthDetails = openIDConnectService.getOAuthDetails();
    let authFactors = oAuthDetails?.authFactors;

    let wlaList =
      openIDConnectService.getEsignetConfiguration(
        configurationKeys.walletConfig
      ) ?? process.env.REACT_APP_WALLET_CONFIG;

    let loginOptions = getAllAuthFactors(authFactors, wlaList);

    if (loginOptions.length === 1) {
      handleSignInOptionClick(loginOptions[0].value, icons, authLabel);
    }

    setSinginOptions(loginOptions);
    setShowMoreOptions(loginOptions.length > 4 && loginOptions.length !== 5);
    setStatus({ state: states.LOADED, msg: '' });
  }, []);

  const optionLabel = (option) =>
    t(authLabel || 'login_with', {
      option: t(option.label, option.label),
    });

  const tooltipDefaults = {
    otp_tooltip_question: 'What is OTP or Code?',
    otp_tooltip_answer:
      'OTP or Code is one time password sent to your registered phone via SMS or registered email',
    totp_tooltip_question: 'What is TOTP Code?',
    totp_tooltip_answer:
      'TOTP is a time-based one-time password — a 6-digit code from your authenticator app that changes every 30 seconds to keep your login secure.',
    bio_tooltip_question: 'What is Biometrics?',
    bio_tooltip_answer: 'Biometrics is your fingerprints, iris or face',
  };

  return (
    <div className="text-white">
      <h1 className="leading-5 font-sans font-medium mb-5 text-center text-2xl">
        {t('preferred_mode_of_login')}
      </h1>

      {status.state === states.LOADING && (
        <div>
          <LoadingIndicator size="medium" message={status.msg} />
        </div>
      )}

      {status.state === states.LOADED && singinOptions && (
        <div className="flex flex-col gap-5">
          {singinOptions
            .slice(0, showMoreOptions ? 4 : undefined)
            .map((option, idx) => (
              <div key={idx} className="min-h-fit relative flex flex-col">
                <button
                  type="button"
                  className="bg-[#0F4356] w-full flex items-center justify-between gap-2 px-5 py-2.5 min-h-12 cursor-pointer rounded-[6px]"
                  id={option.id}
                  onClick={() =>
                    handleSignInOptionClick(option.value, icons, authLabel)
                  }
                >
                  <img
                    className="mx-2 h-8 w-8 shrink-0"
                    src={resolveAssetUrl(option.icon)}
                    alt={option.id}
                  />
                  <div className="text-center text-base font-semibold text-white flex-1 min-w-0 break-words">
                    {optionLabel(option)}
                  </div>
                  <ChevronRight />
                </button>
                {option.tooltip && (
                  <div className="relative flex justify-center items-center text-white">
                    <Tooltip
                      content={t(option.tooltip.answer, {
                        defaultValue:
                          tooltipDefaults[option.tooltip.answer] ||
                          option.tooltip.answer,
                      })}
                    >
                      <button
                        type="button"
                        className="px-2 py-1 flex items-center gap-1.5 text-sm"
                      >
                        <InfoIcon />
                        {t(option.tooltip.question, {
                          defaultValue:
                            tooltipDefaults[option.tooltip.question] ||
                            option.tooltip.question,
                        })}
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {showMoreOptions && (
        <div
          className="text-center cursor-pointer font-medium text-[#0953FA] mt-3 flex flex-row rtl:flex-row-reverse items-center justify-center"
          onClick={() => setShowMoreOptions(false)}
          onKeyDown={() => setShowMoreOptions(false)}
          id="show-more-options"
          role="button"
          tabIndex={0}
        >
          <span className="mr-2 rtl:ml-2">{t('more_ways_to_sign_in')}</span>
          <span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="1em"
              viewBox="0 0 512 512"
            >
              <path
                className="fill-[#0953FA]"
                d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"
              />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
}

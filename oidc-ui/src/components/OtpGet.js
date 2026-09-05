import { useEffect, useRef, useState } from 'react';
import LoadingIndicator from '../common/LoadingIndicator';
import FormAction from './FormAction';
import { LoadingStates as states } from '../constants/states';
import { useTranslation } from 'react-i18next';
import { buttonTypes, configurationKeys } from '../constants/clientConstants';
import ReCAPTCHA from 'react-google-recaptcha';
import AltchaWidget from './AltchaWidget';
import {
  getCaptchaChallengeUrl,
  getCaptchaProvider,
} from '../helpers/captchaConfig';
import ErrorBanner from '../common/ErrorBanner';
import langConfigService from '../services/langConfigService';
import redirectOnError from '../helpers/redirectOnError';
import LoginIDOptions from './LoginIDOptions';
import InputWithPrefix from './InputWithPrefix';
import Tooltip from './tooltip';
import FanQrScanner from './FanQrScanner';

const fanInputClass =
  'rounded-md appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-white focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm';

const fanInputCustomClass =
  'h-10 border border-input border-gray bg-transparent px-3 py-2 text-sm ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus:outline-none focus-visible:outline-none focus:border-gray focus-visible:border-gray file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-white/80 disabled:cursor-not-allowed disabled:bg-muted-light-gray shadow-none text-center background-transparent active:border-gray text-white';

const QrCodeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="5" height="5" x="3" y="3" rx="1" />
    <rect width="5" height="5" x="16" y="3" rx="1" />
    <rect width="5" height="5" x="3" y="16" rx="1" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
    <path d="M21 21v.01" />
    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
    <path d="M3 12h.01" />
    <path d="M12 3h.01" />
    <path d="M12 16v.01" />
    <path d="M16 12h1" />
    <path d="M21 12v.01" />
    <path d="M12 21v-1" />
  </svg>
);

export default function OtpGet({
  param,
  authService,
  openIDConnectService,
  onOtpSent,
  i18nKeyPrefix1 = 'otp',
  i18nKeyPrefix2 = 'errors',
  getCaptchaToken,
}) {
  const { t: t1, i18n } = useTranslation('translation', {
    keyPrefix: i18nKeyPrefix1,
  });

  const { t: t2 } = useTranslation('translation', {
    keyPrefix: i18nKeyPrefix2,
  });

  const [langConfig, setLangConfig] = useState(null);

  useEffect(() => {
    async function loadLangConfig() {
      try {
        const config = await langConfigService.getEnLocaleConfiguration();
        setLangConfig(config);
      } catch (e) {
        console.error('Failed to load lang config', e);
        setLangConfig({ errors: { otp: {} } }); // Fallback to prevent crashes
      }
    }

    loadLangConfig();
  }, []);

  const fields = param;
  let fieldsState = {};
  fields.forEach((field) => (fieldsState['Otp_' + field.id] = ''));

  const post_SendOtp = authService.post_SendOtp;

  const commaSeparatedChannels =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.sendOtpChannels
    ) ?? process.env.REACT_APP_SEND_OTP_CHANNELS;

  const captchaEnableComponents =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.captchaEnableComponents
    ) ?? process.env.REACT_APP_CAPTCHA_ENABLE;

  const captchaEnableComponentsList = captchaEnableComponents
    .split(',')
    .map((x) => x.trim().toLowerCase());

  const [showCaptcha, setShowCaptcha] = useState(
    captchaEnableComponentsList.indexOf('send-otp') !== -1
  );

  const captchaSiteKey =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.captchaSiteKey
    ) ?? process.env.REACT_APP_CAPTCHA_SITE_KEY;
  const captchaProvider = getCaptchaProvider(openIDConnectService);
  const captchaChallengeUrl = getCaptchaChallengeUrl(openIDConnectService);

  const [status, setStatus] = useState({ state: states.LOADED, msg: '' });
  const [errorBanner, setErrorBanner] = useState(null);
  const [showFanQrScanner, setShowFanQrScanner] = useState(false);

  const [captchaToken, setCaptchaToken] = useState(null);
  const _reCaptchaRef = useRef(null);
  const [captchaWidgetKey, setCaptchaWidgetKey] = useState(0);

  const [currentLoginID, setCurrentLoginID] = useState(null);
  const [countryCode, setCountryCode] = useState(null);
  const [individualId, setIndividualId] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [isBtnDisabled, setIsBtnDisabled] = useState(true);
  const [prevLanguage, setPrevLanguage] = useState(i18n.language);

  useEffect(() => {
    let loadComponent = async () => {
      i18n.on('languageChanged', function () {
        if (showCaptcha) {
          //to rerender recaptcha widget on language change
          setShowCaptcha(false);
          setTimeout(() => {
            setShowCaptcha(true);
          }, 1);
        }
      });
    };

    loadComponent();
  }, []);

  const handleCaptchaChange = (value) => {
    setCaptchaToken(value);
    getCaptchaToken?.(value);
  };

  function getPropertiesForLoginID(loginID, label) {
    const { prefixes, maxLength: outerMaxLength, regex: outerRegex } = loginID;

    if (Array.isArray(prefixes) && prefixes.length > 0) {
      const prefix = prefixes.find((prefix) => prefix.label === label);
      if (prefix) {
        return {
          maxLength: prefix.maxLength || outerMaxLength || null,
          regex: prefix.regex || outerRegex || null,
        };
      }
    }

    return {
      maxLength: outerMaxLength || null,
      regex: outerRegex || null,
    };
  }

  const handleChange = (e) => {
    onCloseHandle();
    const idProperties = getPropertiesForLoginID(
      currentLoginID,
      e.target.name.split('_')[1]
    );
    const maxLength = idProperties.maxLength;
    const regex = idProperties.regex ? new RegExp(idProperties.regex) : null;
    const trimmedValue = e.target.value.trim();

    let newValue = trimmedValue;

    setIndividualId(newValue); // Update state with the visible valid value

    setIsBtnDisabled(
      !(
        (
          (!maxLength && !regex) || // Case 1: No maxLength, no regex
          (maxLength && !regex && newValue.length <= parseInt(maxLength)) || // Case 2: maxLength only
          (!maxLength && regex && regex.test(newValue)) || // Case 3: regex only
          (maxLength &&
            regex &&
            newValue.length <= parseInt(maxLength) &&
            regex.test(newValue))
        ) // Case 4: Both maxLength and regex
      )
    );
  };

  useEffect(() => {
    if (i18n.language === prevLanguage) {
      setIndividualId(null);
      setIsBtnDisabled(true);
      onCloseHandle();
      if (currentLoginID && currentLoginID.prefixes) {
        setSelectedCountry(currentLoginID.prefixes[0]);
      }
    } else {
      setPrevLanguage(i18n.language);
    }
  }, [currentLoginID]);

  /**
   * Reset the captcha widget
   * & its token value
   */
  const resetCaptcha = () => {
    if (captchaProvider === 'altcha') {
      setCaptchaWidgetKey((key) => key + 1);
    } else {
      _reCaptchaRef.current?.reset();
    }
    setCaptchaToken(null);
    getCaptchaToken?.(null);
  };

  const sendOTP = async () => {
    try {
      let transactionId = openIDConnectService.getTransactionId();
      let prefix = currentLoginID.prefixes
        ? typeof currentLoginID.prefixes === 'object'
          ? countryCode
          : currentLoginID.prefixes
        : '';
      let id = individualId;
      let postfix = currentLoginID.postfix ? currentLoginID.postfix : '';

      let ID = prefix + id + postfix;

      let otpChannels = commaSeparatedChannels.split(',').map((x) => x.trim());

      setStatus({ state: states.LOADING, msg: 'sending_otp_msg' });
      const sendOtpResponse = await post_SendOtp(
        transactionId,
        ID,
        otpChannels,
        captchaToken
      );
      setStatus({ state: states.LOADED, msg: '' });

      const { response, errors } = sendOtpResponse;

      if (errors !== null && errors.length > 0) {
        if (errors[0].errorCode === 'invalid_transaction') {
          redirectOnError(errors[0].errorCode, t2(`${errors[0].errorCode}`));
          return;
        }
        const fieldLabel = currentLoginID?.id ? t1(currentLoginID.id) : 'ID';
        const field =
          !fieldLabel ||
          fieldLabel === currentLoginID?.id ||
          fieldLabel.startsWith('otp.')
            ? 'ID'
            : fieldLabel;
        let errorCodeCondition =
          langConfig.errors.otp[errors[0].errorCode] !== undefined &&
          langConfig.errors.otp[errors[0].errorCode] !== null;

        if (errorCodeCondition) {
          setErrorBanner({
            errorCode: `otp.${errors[0].errorCode}`,
            show: true,
            field: field,
          });
        } else {
          setErrorBanner({
            errorCode: `${errors[0].errorCode}`,
            show: true,
            field: field,
          });
        }
        if (showCaptcha) {
          resetCaptcha();
        }
        return;
      } else {
        onOtpSent(
          { prefix: prefix, id: id, postfix: postfix },
          response,
          currentLoginID,
          selectedCountry
        );
        setErrorBanner(null);
      }
    } catch (error) {
      setErrorBanner({
        errorCode: 'otp.send_otp_failed_msg',
        show: true,
      });
      setStatus({ state: states.ERROR, msg: '' });
      if (showCaptcha) {
        resetCaptcha();
      }
    }
  };

  const onCloseHandle = () => {
    setErrorBanner(null);
  };

  const handleFanScanned = (fan) => {
    setShowFanQrScanner(false);
    setErrorBanner(null);
    setIndividualId(fan);
    setIsBtnDisabled(false);

    if (currentLoginID?.id) {
      const inputEl = document.getElementById(`Otp_${currentLoginID.id}`);
      if (inputEl) {
        inputEl.value = fan;
      }
    }
  };

  const openFanQrScanner = () => {
    setErrorBanner(null);
    setShowFanQrScanner(true);
  };

  return (
    <div className="text-white">
      {errorBanner !== null && (
        <div className="mb-4">
          <ErrorBanner
            showBanner={errorBanner.show}
            errorCode={t2(errorBanner.errorCode, {
              field: errorBanner.field,
            })}
            onCloseHandle={onCloseHandle}
          />
        </div>
      )}
      <LoginIDOptions
        currentLoginID={(value) => {
          setCurrentLoginID(value);
        }}
      />
      <div>
        {currentLoginID ? (
          <>
            <div>
              <h2 className="text-2xl font-medium text-center text-white mb-5 leading-snug px-1">
                {t1('vid_label_text')}
              </h2>
              {currentLoginID?.prefixes?.length > 0 ? (
                <InputWithPrefix
                  currentLoginID={currentLoginID}
                  login="Otp"
                  hideLabel={true}
                  countryCode={(val) => {
                    setCountryCode(val);
                  }}
                  selectedCountry={(val) => {
                    setSelectedCountry(val);
                  }}
                  individualId={(val) => {
                    setIndividualId(val);
                  }}
                  isBtnDisabled={(val) => {
                    setIsBtnDisabled(val);
                  }}
                  i18nPrefix={i18nKeyPrefix1}
                />
              ) : (
                fields.map((field) => (
                  <div
                    key={'Otp_' + currentLoginID.id}
                    className="flex items-center gap-2"
                  >
                    <label
                      htmlFor={'Otp_' + currentLoginID.id}
                      className="sr-only"
                    >
                      {t1('vid')}
                    </label>
                    <input
                      onChange={handleChange}
                      value={individualId ?? ''}
                      id={'Otp_' + currentLoginID.id}
                      name={'Otp_' + currentLoginID.id}
                      type={field.type}
                      required={field.isRequired}
                      className={`${fanInputClass} ${fanInputCustomClass} flex-1 min-w-0`}
                      placeholder={t1('vid_placeholder')}
                      title={t1('vid_info')}
                    />
                    <button
                      type="button"
                      onClick={openFanQrScanner}
                      aria-label={t1('scan_fan_qr')}
                      title={t1('scan_fan_qr')}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray bg-transparent text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <QrCodeIcon />
                    </button>
                  </div>
                ))
              )}

              <div className="flex justify-center items-center text-white mt-3 gap-2 flex-wrap">
                <Tooltip
                  content={
                    <p className="text-center whitespace-normal max-w-xs">
                      {t1('what_is_fan_answer')}
                    </p>
                  }
                >
                  <button
                    type="button"
                    className="px-2 py-1 flex items-center gap-1.5 text-sm"
                  >
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
                    {t1('what_is_fan')}
                  </button>
                </Tooltip>
              </div>
            </div>

            {showCaptcha && (
              <div className="flex justify-center mt-5 mb-2">
                {captchaProvider === 'altcha' ? (
                  <AltchaWidget
                    challengeUrl={captchaChallengeUrl}
                    language={i18n.language}
                    onVerified={handleCaptchaChange}
                    widgetKey={captchaWidgetKey}
                  />
                ) : (
                  <ReCAPTCHA
                    hl={i18n.language}
                    ref={_reCaptchaRef}
                    onChange={handleCaptchaChange}
                    sitekey={captchaSiteKey}
                  />
                )}
              </div>
            )}

            <div className="mt-5 mb-2">
              <FormAction
                type={buttonTypes.button}
                text={t1('get_otp')}
                handleClick={sendOTP}
                id="get_otp"
                disabled={
                  !individualId ||
                  isBtnDisabled ||
                  (showCaptcha && captchaToken === null)
                }
              />
            </div>

            {status.state === states.LOADING && (
              <LoadingIndicator size="medium" message={status.msg} />
            )}
          </>
        ) : (
          <div className="py-6">
            <LoadingIndicator size="medium" message="loading_msg" />
          </div>
        )}
      </div>

      <FanQrScanner
        open={showFanQrScanner}
        onClose={() => setShowFanQrScanner(false)}
        onScan={handleFanScanned}
        openIDConnectService={openIDConnectService}
      />
    </div>
  );
}

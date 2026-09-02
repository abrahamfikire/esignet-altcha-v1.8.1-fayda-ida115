import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PinInput from 'react-pin-input';
import LoadingIndicator from '../common/LoadingIndicator';
import ErrorBanner from '../common/ErrorBanner';
import FormAction from './FormAction';
import LoginIDOptions from './LoginIDOptions';
import InputWithPrefix from './InputWithPrefix';
import { LoadingStates as states } from '../constants/states';
import langConfigService from '../services/langConfigService';
import redirectOnError from '../helpers/redirectOnError';
import {
  buttonTypes,
  challengeFormats,
  challengeTypes,
} from '../constants/clientConstants';

const fanInputClass =
  'rounded-md appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-white focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm';

const fanInputCustomClass =
  'h-10 border border-input border-gray bg-transparent px-3 py-2 text-sm ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus:outline-none focus-visible:outline-none focus:border-gray focus-visible:border-gray file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-white/80 disabled:cursor-not-allowed disabled:bg-muted-light-gray shadow-none text-center background-transparent active:border-gray text-white';

const TOTP_LENGTH = 6;

export default function Totp({
  param,
  authService,
  openIDConnectService,
  backButtonDiv,
  i18nKeyPrefix1 = 'totp',
  i18nKeyPrefix2 = 'errors',
}) {
  const { t: t1, i18n } = useTranslation('translation', {
    keyPrefix: i18nKeyPrefix1,
  });
  const { t: t2 } = useTranslation('translation', {
    keyPrefix: i18nKeyPrefix2,
  });
  const navigate = useNavigate();

  const fields = param;
  const post_AuthenticateUser = authService.post_AuthenticateUser;
  const buildRedirectParams = authService.buildRedirectParamsV2;

  const [langConfig, setLangConfig] = useState(null);
  const [totpValue, setTotpValue] = useState('');
  const [status, setStatus] = useState({ state: states.LOADED, msg: '' });
  const [errorBanner, setErrorBanner] = useState(null);
  const [currentLoginID, setCurrentLoginID] = useState(null);
  const [countryCode, setCountryCode] = useState(null);
  const [individualId, setIndividualId] = useState(null);
  const [isBtnDisabled, setIsBtnDisabled] = useState(true);
  const [prevLanguage, setPrevLanguage] = useState(i18n.language);
  const pinRef = useRef(null);

  useEffect(() => {
    async function loadLangConfig() {
      try {
        const config = await langConfigService.getEnLocaleConfiguration();
        setLangConfig(config);
      } catch (e) {
        console.error('Failed to load lang config', e);
        setLangConfig({ errors: { totp: {} } });
      }
    }

    loadLangConfig();
  }, []);

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
    const newValue = e.target.value.trim();

    setIndividualId(newValue);
    setIsBtnDisabled(
      !(
        (!maxLength && !regex) ||
        (maxLength && !regex && newValue.length <= parseInt(maxLength)) ||
        (!maxLength && regex && regex.test(newValue)) ||
        (maxLength &&
          regex &&
          newValue.length <= parseInt(maxLength) &&
          regex.test(newValue))
      )
    );
  };

  useEffect(() => {
    if (i18n.language === prevLanguage) {
      setIndividualId(null);
      setTotpValue('');
      setIsBtnDisabled(true);
      onCloseHandle();
      pinRef.current?.clear?.();
      if (currentLoginID && currentLoginID.prefixes) {
        setCountryCode(currentLoginID.prefixes[0]);
      }
    } else {
      setPrevLanguage(i18n.language);
    }
  }, [currentLoginID]);

  const handleSubmit = (e) => {
    e.preventDefault();
    authenticateTotpUser();
  };

  const authenticateTotpUser = async () => {
    try {
      setErrorBanner(null);
      const transactionId = openIDConnectService.getTransactionId();
      const prefix = currentLoginID?.prefixes
        ? typeof currentLoginID.prefixes === 'object'
          ? countryCode
          : currentLoginID.prefixes
        : '';
      const id = individualId;
      const postfix = currentLoginID?.postfix ? currentLoginID.postfix : '';
      const ID = prefix + id + postfix;

      const challengeList = [
        {
          authFactorType: challengeTypes.totp,
          challenge: totpValue,
          format: challengeFormats.totp,
        },
      ];

      setStatus({ state: states.LOADING, msg: 'authenticating_msg' });

      const authenticateResponse = await post_AuthenticateUser(
        transactionId,
        ID,
        challengeList
      );

      setStatus({ state: states.LOADED, msg: '' });

      const { response, errors } = authenticateResponse;

      if (errors !== null && errors.length > 0) {
        const errorCodeCondition =
          langConfig?.errors?.totp?.[errors[0].errorCode] !== undefined &&
          langConfig?.errors?.totp?.[errors[0].errorCode] !== null;

        if (errorCodeCondition) {
          setErrorBanner({
            errorCode: `errors.totp.${errors[0].errorCode}`,
            show: true,
          });
        } else if (errors[0].errorCode === 'invalid_transaction') {
          redirectOnError(errors[0].errorCode, t2(`${errors[0].errorCode}`));
        } else {
          setErrorBanner({
            errorCode: `errors.${errors[0].errorCode}`,
            show: true,
          });
        }
        pinRef.current?.clear?.();
        setTotpValue('');
        return;
      }

      setErrorBanner(null);
      const params = buildRedirectParams({
        nonce: openIDConnectService.getNonce(),
        state: openIDConnectService.getState(),
        oauthResponse: openIDConnectService.getOAuthDetails(),
        consentAction: response.consentAction,
        ui_locales: i18n.language,
      });

      navigate(process.env.PUBLIC_URL + '/claim-details' + params, {
        replace: true,
      });
    } catch (error) {
      setErrorBanner({
        errorCode: 'errors.totp.authentication_failed_msg',
        show: true,
      });
      setStatus({ state: states.ERROR, msg: '' });
      pinRef.current?.clear?.();
      setTotpValue('');
    }
  };

  const onCloseHandle = () => {
    setErrorBanner(null);
  };

  let pinStyles = {
    width: '44px',
    height: '48px',
    margin: '0 6px',
    borderBottom: '2px solid #ffffff',
    color: '#ffffff',
    fontSize: '1.35rem',
    fontWeight: '600',
    backgroundColor: 'transparent',
    WebkitTextFillColor: '#ffffff',
    caretColor: '#ffffff',
  };

  if (window.screen.availWidth <= 375) {
    pinStyles = { ...pinStyles, width: '2.2em', fontSize: '1.2rem' };
  }

  return (
    <div className="text-white">
      <div className="flex items-center">{backButtonDiv}</div>

      {errorBanner !== null && (
        <div className="mb-4">
          <ErrorBanner
            showBanner={errorBanner.show}
            errorCode={errorBanner.errorCode}
            onCloseHandle={onCloseHandle}
          />
        </div>
      )}

      <LoginIDOptions
        currentLoginID={(value) => {
          setCurrentLoginID(value);
        }}
      />

      {currentLoginID ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {currentLoginID?.prefixes?.length > 0 ? (
            <InputWithPrefix
              currentLoginID={currentLoginID}
              login="Totp"
              hideLabel={true}
              countryCode={(val) => {
                setCountryCode(val);
              }}
              selectedCountry={(val) => {
                setCountryCode(val);
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
              <div key={'Totp_' + currentLoginID.id}>
                <label
                  htmlFor={'Totp_' + currentLoginID.id}
                  className="sr-only"
                >
                  {t1('vid')}
                </label>
                <input
                  onChange={handleChange}
                  value={individualId ?? ''}
                  id={'Totp_' + currentLoginID.id}
                  name={'Totp_' + currentLoginID.id}
                  type={field.type}
                  required={field.isRequired}
                  className={`${fanInputClass} ${fanInputCustomClass} w-full`}
                  placeholder={t1('vid_placeholder')}
                  title={t1('vid_info')}
                />
              </div>
            ))
          )}

          <div className="mt-6 text-center">
            <p className="mb-3 text-sm text-white/90">
              {t1('enter_faydapass_code')}
            </p>
            <div
              className="flex justify-center text-white"
              id="totp_verify_input"
            >
              <PinInput
                length={TOTP_LENGTH}
                initialValue=""
                onChange={(value) => setTotpValue(value)}
                type="numeric"
                inputMode="number"
                style={{ padding: '5px 0px', color: '#fff' }}
                inputStyle={pinStyles}
                inputFocusStyle={{
                  borderBottom: '2px solid #7dd3fc',
                  color: '#ffffff',
                }}
                onComplete={(value) => setTotpValue(value)}
                autoSelect={true}
                ref={pinRef}
              />
            </div>
          </div>

          {status.state === states.LOADING && (
            <LoadingIndicator size="medium" message={status.msg} />
          )}

          <div className="mt-5">
            <FormAction
              disabled={
                totpValue.length !== TOTP_LENGTH ||
                !individualId?.trim() ||
                isBtnDisabled
              }
              type={buttonTypes.submit}
              text={t1('verify')}
              id="verify_totp"
            />
          </div>
        </form>
      ) : (
        <div className="py-6">
          <LoadingIndicator size="medium" message="loading_msg" />
        </div>
      )}
    </div>
  );
}

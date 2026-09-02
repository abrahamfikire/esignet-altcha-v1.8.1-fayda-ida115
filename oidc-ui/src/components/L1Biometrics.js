import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import LoadingIndicator from '../common/LoadingIndicator';
import {
  challengeFormats,
  challengeTypes,
  configurationKeys,
} from '../constants/clientConstants';
import { LoadingStates as states } from '../constants/states';
import InputWithImage from './InputWithImage';
import { useTranslation } from 'react-i18next';
import { init, propChange } from '@mosip/secure-biometric-interface-integrator';
import ErrorBanner from '../common/ErrorBanner';
import langConfigService from '../services/langConfigService';
import redirectOnError from '../helpers/redirectOnError';
import ReCAPTCHA from 'react-google-recaptcha';
import LoginIDOptions from './LoginIDOptions';
import InputWithPrefix from './InputWithPrefix';
import {
  isErshaClientId,
  preloadSbiLivenessAssets,
} from '../services/sbiLivenessPreload';
import { shouldSkipLocalSbiDiscovery } from '../services/deviceUtils';

let fieldsState = {};

const FAYDA_DEVICE_ID = 'embedded-fayda-face';
const SBI_CONTAINER_ID = 'secure-biometric-interface-integration';
const SBI_LIVENESS_MODAL_SIZE =
  'min(640px, calc(100vw - 2rem), calc(100vh - 2rem))';
const SBI_FACE_MODALITY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAYAAABWk2cPAAAABHNCSVQICAgIfAhkiAAAAvBJREFUSEvFllmoTlEUx12ZkzFzpiJDSYk3UkgpU5nKEDKUKVOKJyKJB7Mi4npAmW94EUpRCi9cl8hQyhDJkHtJ4fe7nVPbvd/9zj5Sdv36zv7O2uu/h7XWPiX1/kMrCTQb8dwJekMbCN9V0L8fMb/+2AwI7H7x/BGewCv47rvUsYLjYFUi+K2GwDX6qyNEt2IzuoZdk0R4L79noSoV7U7nOLyF/cmsnGXaXvPwIUK0FTZdAjv9d4B50APmQ0UqOorOHlgOlyOc5zUZzoAdsAnKUtGpdNbBLCjP6zHCvi82B+EIHE1Fp9FZCzPhQYSTvCZ9GHAISiWvaGMGDYGJYKQbAxfgFlQVmclfizbAqYHgjryDZ9ANOsM+MDor6xAuKGpuzYHNUFeUei4G2TnYmKzMdFgD0xNu1iHakv9Nx4twJywARXan+pU5aJSPBBM+bS14KIOHsDjLie/ziJ7B/idMKeDYqGwL4/+16AEc9gKD6EvgvDnPx+A9WAQyW56VjsGbCW7QnAbPvjVMgKWwAdyNzJZH1O0rhUFwBd5AexgBj8DIfpmpiEGs6FBsJ4O/1lKdm5dNwVrrqm8kK73Ob1i3a80jS7Q+IxbCAvAcT4LXnNH7AxqC6WA6OSkndBh2g0FXsGWJGjSmirPfCS+gUAFwxd5Uy2AsmLtOMLeoZ+h19xUWgSUvq5mzFvauYIBZuWq1dKXe+LNhC6SJb85tB6vNbSh6ToFnt9pAWwmnkv89ghVwCe4WK/hLMJgBk8BLPLaZt4r6lbAtGRRd8P3scAcMjM+xith5E3kcT8EbyBYtmkMn07Sg6H/5cnArd4Hl7GrmvPMbDGOIKefVeT4NpJ50TI/nYGE3PcJoteR9itAySjsGdvpvB3OhH1hkylNRD9+KYsR6MZubYfO7d32EqDbeuWFrRsfqZf6egMqwIllVXLGH7u0RvrtH31zNaoMxGBgYuVvu0GMwmqurWaEyaL2t+b91NKY4OM7xYXPcH3X4NzGTqjw5j8uPAAAAAElFTkSuQmCC';

export default function L1Biometrics({
  param,
  authService,
  openIDConnectService,
  backButtonDiv,
  i18nKeyPrefix1 = 'l1Biometrics',
  i18nKeyPrefix2 = 'errors',
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
        setLangConfig({ errors: { otp: {}, biometrics: {} } });
      }
    }

    loadLangConfig();
  }, []);

  const inputCustomClass =
    '!text-white h-10 border border-white/40 bg-transparent px-3 py-2 text-sm ring-0 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-white/80 focus-visible:outline-none disabled:cursor-not-allowed shadow-none';

  const firstRender = useRef(true);
  const transactionId = openIDConnectService.getTransactionId();

  const inputFields = param.inputFields;

  const { post_AuthenticateUser, buildRedirectParamsV2: buildRedirectParams } =
    authService;

  const oidcClientId = authService.getClientId?.() ?? null;
  const isErshaClient = isErshaClientId(oidcClientId);
  const skipLocalSbi = shouldSkipLocalSbiDiscovery();

  inputFields.forEach((field) => (fieldsState['sbi_' + field.id] = ''));

  const [status, setStatus] = useState({
    state: states.LOADED,
    msg: '',
  });

  const [errorBanner, setErrorBanner] = useState(null);
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [internalModalSrc, setInternalModalSrc] = useState('');
  const [internalSuccess, setInternalSuccess] = useState(false);
  const [internalIframeKey, setInternalIframeKey] = useState(0);
  const internalIframeRef = useRef(null);
  const internalActiveIframeWindowRef = useRef(null);
  const internalRunIdRef = useRef(null);
  const internalResultSeqRef = useRef(0);
  const selectedDeviceRef = useRef(null);
  const userDeviceChoiceRef = useRef(false);
  const embeddedUiGuardRef = useRef(false);
  const onCaptureHandlerRef = useRef(() => {});
  const internalEmbedParamsRef = useRef(null);
  const navigate = useNavigate();
  const [captchaToken, setCaptchaToken] = useState(null);
  const _reCaptchaRef = useRef(null);

  const [currentLoginID, setCurrentLoginID] = useState(null);
  const [countryCode, setCountryCode] = useState(null);
  const [individualId, setIndividualId] = useState(null);
  const [isValid, setIsValid] = useState(false);
  const [isBtnDisabled, setIsBtnDisabled] = useState(true);
  const [prevLanguage, setPrevLanguage] = useState(i18n.language);

  const individualIdRef = useRef(individualId);
  const currentLoginIDRef = useRef(currentLoginID);
  const countryCodeRef = useRef(countryCode);
  individualIdRef.current = individualId;
  currentLoginIDRef.current = currentLoginID;
  countryCodeRef.current = countryCode;

  const faydaLabel = (() => {
    const fromEnv = String(window._env_?.FAYDA_SBI_LABEL ?? '').trim();
    if (fromEnv) return fromEnv;
    const translated = t1('fayda_face_sbi');
    // Artifactory locale packs may omit this key → i18n returns "l1Biometrics.fayda_face_sbi"
    if (
      !translated ||
      translated === 'fayda_face_sbi' ||
      translated.endsWith('.fayda_face_sbi')
    ) {
      return 'VeriFayda Face (Liveness)';
    }
    return translated;
  })();

  const isFaydaDeviceSelected = () =>
    isErshaClient && selectedDeviceRef.current === FAYDA_DEVICE_ID;

  const captchaEnableComponents =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.captchaEnableComponents
    ) ?? process.env.REACT_APP_CAPTCHA_ENABLE;

  const captchaEnableComponentsList = captchaEnableComponents
    .split(',')
    .map((x) => x.trim().toLowerCase());

  const [showCaptcha, setShowCaptcha] = useState(
    captchaEnableComponentsList.indexOf('bio') !== -1
  );

  const captchaSiteKey =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.captchaSiteKey
    ) ?? process.env.REACT_APP_CAPTCHA_SITE_KEY;

  const authTxnIdLengthValue =
    openIDConnectService.getEsignetConfiguration(
      configurationKeys.authTxnIdLength
    ) ?? process.env.REACT_APP_AUTH_TXN_ID_LENGTH;

  const authTxnIdLength = parseInt(authTxnIdLengthValue);

  const syncSelectedDeviceFromDom = (container) => {
    const selectedOption = container?.querySelector(
      '.sbd-dropdown__option.selected'
    );
    if (!selectedOption?.id?.startsWith('deviceOption')) return;

    selectedDeviceRef.current = selectedOption.id.replace('deviceOption', '');
  };

  const selectFaydaDeviceOption = (container) => {
    const option = container?.querySelector(`#deviceOption${FAYDA_DEVICE_ID}`);
    if (!option) return;

    if (
      option.classList.contains('selected') &&
      selectedDeviceRef.current === FAYDA_DEVICE_ID
    ) {
      return;
    }

    container
      .querySelectorAll('.sbd-dropdown__option.selected')
      .forEach((el) => el.classList.remove('selected'));
    option.classList.add('selected');

    const singleValue = container.querySelector('.sbd-dropdown__single-value');
    if (singleValue) {
      singleValue.innerHTML = option.innerHTML;
    }

    container
      .querySelector('.sbd-dropdown__container')
      ?.classList.remove('active');
    selectedDeviceRef.current = FAYDA_DEVICE_ID;
  };

  const createFaydaDeviceOption = (container, menuList) => {
    const option = document.createElement('div');
    option.id = `deviceOption${FAYDA_DEVICE_ID}`;
    option.className = 'sbd-dropdown__option';
    option.innerHTML = `
      <div class="sbd-flex sbd-items-center h-7">
        <img class="w-7" src="${SBI_FACE_MODALITY_ICON}" alt="${faydaLabel}" />
        <p class="sbd-text-xs sbd-ml-2">${faydaLabel}</p>
        <p class="ready sbd-ml-auto sbd-mr-2">●</p>
      </div>
    `;
    option.addEventListener('click', () => {
      userDeviceChoiceRef.current = true;
      selectFaydaDeviceOption(container);
    });
    menuList.insertBefore(option, menuList.firstChild);
    return option;
  };

  const removeFaydaDeviceOption = (container) => {
    const option = container?.querySelector(`#deviceOption${FAYDA_DEVICE_ID}`);
    if (option) {
      option.remove();
    }
    if (selectedDeviceRef.current === FAYDA_DEVICE_ID) {
      selectedDeviceRef.current = null;
      userDeviceChoiceRef.current = false;
    }
  };

  const stripLocalSbiDeviceOptions = (container) => {
    if (!skipLocalSbi) return;

    const menuList = container?.querySelector('.sbd-dropdown__menu-list');
    if (!menuList) return;

    menuList.querySelectorAll('.sbd-dropdown__option').forEach((option) => {
      if (option.id !== `deviceOption${FAYDA_DEVICE_ID}`) {
        option.remove();
      }
    });
  };

  const injectFaydaDeviceOption = (container) => {
    if (!isErshaClient) {
      removeFaydaDeviceOption(container);
      return false;
    }

    const menuList = container?.querySelector('.sbd-dropdown__menu-list');
    if (!menuList) return false;

    let option = menuList.querySelector(`#deviceOption${FAYDA_DEVICE_ID}`);
    if (!option) {
      createFaydaDeviceOption(container, menuList);
    } else if (option !== menuList.firstChild) {
      menuList.insertBefore(option, menuList.firstChild);
    }

    if (userDeviceChoiceRef.current) {
      syncSelectedDeviceFromDom(container);
    }

    stripLocalSbiDeviceOptions(container);
    return true;
  };

  /**
   * SBI integrator sets "Device Not Found" when local 127.0.0.1 discovery
   * fails. For Ersha clients the embedded Fayda face device is still valid,
   * so hide that false-positive alert and ensure Scan & Verify is available.
   */
  const clearLocalDiscoveryErrorIfFaydaReady = (container) => {
    if (!isErshaClient) return;

    const hasFayda = Boolean(
      container?.querySelector(`#deviceOption${FAYDA_DEVICE_ID}`)
    );
    if (!hasFayda && !isFaydaDeviceSelected()) return;

    container
      ?.querySelectorAll('.sbd-verify-button-div [role="alert"]')
      .forEach((el) => el.remove());

    // Integrator keeps errorState internally; class helps CSS fallback
    container?.classList.add('sbi-fayda-ready');
  };

  const ensureScanAndVerifyButton = (container, formReady) => {
    const verifyDiv = container?.querySelector('.sbd-verify-button-div');
    if (!verifyDiv) return;

    let verifyColumn = verifyDiv.querySelector('.sbd-flex.sbd-flex-col');
    if (!verifyColumn) {
      verifyColumn = document.createElement('div');
      verifyColumn.className = 'sbd-flex sbd-flex-col sbd-w-full';
      verifyDiv.appendChild(verifyColumn);
    }

    let button = verifyColumn.querySelector(
      "button[data-oidc-injected-verify='true']"
    );
    if (!button && !verifyColumn.querySelector('button')) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.oidcInjectedVerify = 'true';
      button.className =
        'sbd-cursor-pointer sbd-block sbd-w-full sbd-font-medium sbd-rounded-lg sbd-text-sm sbd-px-5 sbd-py-2 sbd-text-center sbd-border sbd-border-2 sbd-text-white sbi-scan-verify-button';
      button.textContent = t1('scan_and_verify');
      verifyColumn.appendChild(button);
    }

    if (button) {
      button.disabled = !formReady;
    }
  };

  const refreshEmbeddedSbiUi = (container, formReady) => {
    if (!container || embeddedUiGuardRef.current) return;

    const menuList = container.querySelector('.sbd-dropdown__menu-list');
    if (!menuList) return;

    if (!isErshaClient) {
      if (skipLocalSbi) {
        stripLocalSbiDeviceOptions(container);
      }
      ensureScanAndVerifyButton(container, formReady);
      return;
    }

    stripLocalSbiDeviceOptions(container);

    const faydaOption = menuList.querySelector(
      `#deviceOption${FAYDA_DEVICE_ID}`
    );
    const needsInject = !faydaOption;
    const needsReorder = faydaOption && faydaOption !== menuList.firstChild;
    const needsFaydaDefault =
      !userDeviceChoiceRef.current &&
      faydaOption &&
      !faydaOption.classList.contains('selected');

    if (!needsInject && !needsReorder && !needsFaydaDefault) {
      stripLocalSbiDeviceOptions(container);
      clearLocalDiscoveryErrorIfFaydaReady(container);
      ensureScanAndVerifyButton(container, formReady);
      return;
    }

    embeddedUiGuardRef.current = true;
    try {
      injectFaydaDeviceOption(container);
      if (!userDeviceChoiceRef.current) {
        selectFaydaDeviceOption(container);
      }
      clearLocalDiscoveryErrorIfFaydaReady(container);
      ensureScanAndVerifyButton(container, formReady);
    } finally {
      embeddedUiGuardRef.current = false;
    }
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

  const buildIndividualId = () => {
    const loginID = currentLoginIDRef.current;
    if (!loginID) return null;

    let prefix = loginID.prefixes
      ? typeof loginID.prefixes === 'object'
        ? countryCodeRef.current
        : loginID.prefixes
      : '';
    let id = individualIdRef.current;
    let postfix = loginID.postfix ? loginID.postfix : '';

    if (!id) return null;
    return prefix + id + postfix;
  };

  const handleChange = (e) => {
    setIsValid(true);
    onCloseHandle();
    const idProperties = getPropertiesForLoginID(
      currentLoginID,
      e.target.name.split('_')[1]
    );
    const maxLength = idProperties.maxLength;
    const regex = idProperties.regex ? new RegExp(idProperties.regex) : null;
    const trimmedValue = e.target.value.trim();

    let newValue = trimmedValue;

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

  const handleBlur = (e) => {
    const idProperties = getPropertiesForLoginID(
      currentLoginID,
      e.target.name.split('_')[1]
    );
    const maxLength = idProperties.maxLength;
    const regex = idProperties.regex ? new RegExp(idProperties.regex) : null;
    setIsValid(
      (!maxLength || e.target.value.trim().length <= parseInt(maxLength)) &&
        (!regex || regex.test(e.target.value.trim()))
    );
  };

  useEffect(() => {
    if (i18n.language === prevLanguage) {
      setIndividualId(null);
      setIsValid(false);
      setIsBtnDisabled(true);
      onCloseHandle();
    } else {
      setPrevLanguage(i18n.language);
    }
  }, [currentLoginID]);

  const getInternalSbiVerifyEndpoint = () => {
    const value =
      window._env_?.SBI_VERIFY_ENDPOINT ||
      process.env.REACT_APP_SBI_VERIFY_ENDPOINT ||
      '';
    const endpoint = String(value ?? '').trim();
    console.info('[SBI] SBI_VERIFY_ENDPOINT:', endpoint);
    return endpoint;
  };

  const getSbiEnv = () => {
    const fromOAuth = openIDConnectService.getEsignetConfiguration(
      configurationKeys.sbiEnv
    );
    if (fromOAuth) {
      const value = String(fromOAuth).trim();
      console.info('[SBI] SBI_ENV from OAuth config (sbi.env):', value);
      return value;
    }

    const fromRuntime = String(window._env_?.SBI_ENV ?? '').trim();
    if (fromRuntime) {
      console.info('[SBI] SBI_ENV from window._env_.SBI_ENV:', fromRuntime);
      return fromRuntime;
    }

    const fromBuildEnv = String(
      process.env.REACT_APP_SBI_ENV ?? 'Developer'
    ).trim();
    const value = fromBuildEnv || 'Developer';
    console.info('[SBI] SBI_ENV from REACT_APP_SBI_ENV (fallback):', value);
    return value;
  };

  const getSbiDomainUri = () => {
    const configured = String(window._env_?.SBI_DOMAIN_URI ?? '').trim();
    if (configured) return configured.replace(/\/$/, '');

    const fromEnv = String(process.env.REACT_APP_SBI_DOMAIN_URI ?? '').trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    return `${window.location.origin}`.replace(/\/$/, '');
  };

  const getEsignetConfiguration = (key) => {
    return openIDConnectService.getEsignetConfiguration(configurationKeys[key]);
  };

  const getEmbeddedFaceSbiParams = () => {
    const oidcTxnId = openIDConnectService.getTransactionId();
    const sbiTxnId = getSBIAuthTransactionId(oidcTxnId || transactionId || '');
    const env = String(getSbiEnv() || 'Developer').trim();
    const purpose = 'Auth';
    const requestedScoreRaw =
      openIDConnectService.getEsignetConfiguration(
        configurationKeys.sbiFaceCaptureScore
      ) ?? process.env.REACT_APP_SBI_FACE_CAPTURE_SCORE;
    const requestedScore = Number(requestedScoreRaw);
    const api = getInternalSbiVerifyEndpoint();
    const domainUri = getSbiDomainUri();

    const params = {
      oidcTxnId: String(oidcTxnId ?? '').trim(),
      transactionId: String(sbiTxnId ?? '').trim(),
      env,
      purpose,
      requestedScore: Number.isFinite(requestedScore) ? requestedScore : 70,
      domainUri,
      api,
    };
    console.info('[SBI] Embedded face liveness params:', params);
    return params;
  };

  const pushEmbedConfigToIframe = () => {
    const params = internalEmbedParamsRef.current;
    const iframeWindow = internalIframeRef.current?.contentWindow;
    if (!params || !iframeWindow) return;
    iframeWindow.postMessage(
      {
        type: 'INTERNAL_SBI_EMBED_CONFIG',
        runId: params.runId,
        api: params.api,
        transactionId: params.transactionId,
        env: params.env,
        purpose: params.purpose,
        requestedScore: params.requestedScore,
        domainUri: params.domainUri,
      },
      window.location.origin
    );
  };

  const startInternalSbiVerification = () => {
    setErrorBanner(null);
    setInternalSuccess(false);
    const ID = buildIndividualId();
    if (!ID) return;

    const embedParams = getEmbeddedFaceSbiParams();
    if (!embedParams.transactionId) {
      setErrorBanner({
        errorCode: 'authentication_failed_msg',
        show: true,
      });
      return;
    }

    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    internalRunIdRef.current = runId;
    internalResultSeqRef.current = 0;
    internalActiveIframeWindowRef.current = null;
    setInternalIframeKey((k) => k + 1);

    const paramsWithRun = { ...embedParams, runId };
    internalEmbedParamsRef.current = paramsWithRun;

    const publicBase = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const query = new URLSearchParams({
      embed: '1',
      runId,
      v: 'ios-multi-capture-7',
      transactionId: paramsWithRun.transactionId,
      env: paramsWithRun.env,
      purpose: paramsWithRun.purpose,
      requestedScore: String(paramsWithRun.requestedScore),
      domainUri: paramsWithRun.domainUri,
    });
    if (paramsWithRun.api) {
      query.set('api', paramsWithRun.api);
    }

    setInternalModalSrc(
      `${publicBase}/internal-sbi-liveness.html?${query.toString()}`
    );
    setInternalModalOpen(true);
  };

  const authenticateBiometricResponse = async (biometricResponse) => {
    setErrorBanner(null);
    setStatus({ state: states.LOADED, msg: '' });

    const normalizedResponse = Array.isArray(biometricResponse)
      ? { biometrics: biometricResponse }
      : biometricResponse;

    const { errorCode, defaultMsg } =
      validateBiometricResponse(normalizedResponse);

    if (errorCode !== null) {
      setErrorBanner({
        errorCode: defaultMsg || errorCode,
        show: true,
      });
      return;
    }

    const ID = buildIndividualId();
    if (!ID) {
      setErrorBanner({
        errorCode: 'authentication_failed_msg',
        show: true,
      });
      return;
    }

    try {
      await Authenticate(
        transactionId,
        ID,
        openIDConnectService.encodeBase64(normalizedResponse['biometrics'])
      );
    } catch (error) {
      setErrorBanner({
        errorCode: 'authentication_failed_msg',
        show: true,
      });
    }
  };

  const getSBIAuthTransactionId = (oidcTransactionId) => {
    if (!oidcTransactionId) {
      console.error('oidcTransactionId is undefined');
      return '';
    }

    oidcTransactionId = oidcTransactionId.replace(/-|_/gi, '');

    let derivedTransactionId = '';
    let pointer = oidcTransactionId.length;

    while (derivedTransactionId.length !== authTxnIdLength) {
      derivedTransactionId += oidcTransactionId.charAt(pointer--);
      if (pointer < 0) {
        pointer = oidcTransactionId.length;
      }
    }
    return derivedTransactionId;
  };

  const validateBiometricResponse = (response) => {
    const biometrics = Array.isArray(response)
      ? response
      : response?.biometrics;

    if (!Array.isArray(biometrics) || biometrics.length === 0) {
      return { errorCode: 'no_response_msg', defaultMsg: null };
    }

    for (let i = 0; i < biometrics.length; i++) {
      const entry = biometrics[i];
      const nestedError = entry?.error ?? null;

      if (
        nestedError?.errorCode !== null &&
        nestedError?.errorCode !== undefined &&
        String(nestedError.errorCode).trim() !== '' &&
        String(nestedError.errorCode) !== '0'
      ) {
        return {
          errorCode: String(nestedError.errorCode),
          defaultMsg: nestedError.errorInfo ?? null,
        };
      }

      if (
        entry?.errorCode !== null &&
        entry?.errorCode !== undefined &&
        String(entry.errorCode).trim() !== '' &&
        String(entry.errorCode) !== '0'
      ) {
        return {
          errorCode: String(entry.errorCode),
          defaultMsg: entry.errorInfo ?? null,
        };
      }

      if (entry?.error) delete entry.error;
    }
    return { errorCode: null, defaultMsg: null };
  };

  useEffect(() => {
    let loadComponent = async () => {
      i18n.on('languageChanged', () => {
        if (showCaptcha) {
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
  };

  const resetCaptcha = () => {
    _reCaptchaRef.current.reset();
    setCaptchaToken(null);
  };

  const Authenticate = async (transactionId, id, bioValue) => {
    const challengeList = [
      {
        authFactorType: challengeTypes.bio,
        challenge: bioValue,
        format: challengeFormats.bio,
      },
    ];

    setStatus({
      state: states.AUTHENTICATING,
      msg: 'authenticating_msg',
    });

    const authenticateResponse = await post_AuthenticateUser(
      transactionId,
      id,
      challengeList,
      captchaToken
    );

    setStatus({ state: states.LOADED, msg: '' });

    const { response, errors } = authenticateResponse;

    if (errors !== null && errors.length > 0) {
      let errorCodeCondition =
        langConfig?.errors?.biometrics?.[errors[0].errorCode] !== undefined &&
        langConfig?.errors?.biometrics?.[errors[0].errorCode] !== null;

      if (errorCodeCondition) {
        setErrorBanner({
          errorCode: `biometrics.${errors[0].errorCode}`,
          show: true,
        });
      } else if (errors[0].errorCode === 'invalid_transaction') {
        redirectOnError(errors[0].errorCode, t2(`${errors[0].errorCode}`));
      } else {
        setErrorBanner({
          errorCode: `${errors[0].errorCode}`,
          show: true,
        });
      }
      if (showCaptcha) {
        resetCaptcha();
      }
    } else {
      setErrorBanner(null);
      let params = buildRedirectParams({
        nonce: openIDConnectService.getNonce(),
        state: openIDConnectService.getState(),
        oauthResponse: openIDConnectService.getOAuthDetails(),
        consentAction: response.consentAction,
        ui_locales: i18n.language,
      });

      navigate(process.env.PUBLIC_URL + '/claim-details' + params, {
        replace: true,
      });
    }
  };

  onCaptureHandlerRef.current = authenticateBiometricResponse;

  const formReady =
    !!individualId && !isBtnDisabled && !(showCaptcha && captchaToken === null);

  useEffect(() => {
    if (!isErshaClient) {
      return;
    }
    preloadSbiLivenessAssets();
  }, [isErshaClient]);

  useEffect(() => {
    const configuredPortRange = getEsignetConfiguration('sbiPortRange');
    const configuredDiscTimeout = getEsignetConfiguration(
      'sbiDISCTimeoutInSeconds'
    );
    const configuredDinfoTimeout = getEsignetConfiguration(
      'sbiDINFOTimeoutInSeconds'
    );

    let mosipProp = {
      container: document.getElementById(SBI_CONTAINER_ID),
      buttonLabel: 'scan_and_verify',
      transactionId: getSBIAuthTransactionId(transactionId),
      onCapture: (e) => onCaptureHandlerRef.current(e),
      sbiEnv: {
        env: getSbiEnv(),
        captureTimeout:
          getEsignetConfiguration('sbiCAPTURETimeoutInSeconds') ??
          process.env.REACT_APP_SBI_CAPTURE_TIMEOUT,
        irisBioSubtypes:
          getEsignetConfiguration('sbiIrisBioSubtypes') ??
          process.env.REACT_APP_SBI_IRIS_BIO_SUBTYPES,
        fingerBioSubtypes:
          getEsignetConfiguration('sbiFingerBioSubtypes') ??
          process.env.REACT_APP_SBI_FINGER_BIO_SUBTYPES,
        faceCaptureCount:
          getEsignetConfiguration('sbiFaceCaptureCount') ??
          process.env.REACT_APP_SBI_FACE_CAPTURE_COUNT,
        faceCaptureScore:
          getEsignetConfiguration('sbiFaceCaptureScore') ??
          process.env.REACT_APP_SBI_FACE_CAPTURE_SCORE,
        fingerCaptureCount:
          getEsignetConfiguration('sbiFingerCaptureCount') ??
          process.env.REACT_APP_SBI_FINGER_CAPTURE_COUNT,
        fingerCaptureScore:
          getEsignetConfiguration('sbiFingerCaptureScore') ??
          process.env.REACT_APP_SBI_FINGER_CAPTURE_SCORE,
        irisCaptureCount:
          getEsignetConfiguration('sbiIrisCaptureCount') ??
          process.env.REACT_APP_SBI_IRIS_CAPTURE_COUNT,
        irisCaptureScore:
          getEsignetConfiguration('sbiIrisCaptureScore') ??
          process.env.REACT_APP_SBI_IRIS_CAPTURE_SCORE,
        portRange: skipLocalSbi
          ? '4501-4501'
          : (configuredPortRange ?? process.env.REACT_APP_SBI_PORT_RANGE),
        discTimeout: skipLocalSbi
          ? 1
          : (configuredDiscTimeout ?? process.env.REACT_APP_SBI_DISC_TIMEOUT),
        dinfoTimeout: skipLocalSbi
          ? 1
          : (configuredDinfoTimeout ?? process.env.REACT_APP_SBI_DINFO_TIMEOUT),
        domainUri: getSbiDomainUri(),
      },
      langCode: i18n.language,
      disable: true,
    };

    if (firstRender.current) {
      firstRender.current = false;
      init(mosipProp);
      i18n.on('languageChanged', () => {
        propChange({ langCode: i18n.language });
      });
      return;
    }
    propChange({
      disable: !formReady,
      onCapture: (e) => onCaptureHandlerRef.current(e),
    });
  }, [individualId, isBtnDisabled, captchaToken, countryCode, formReady]);

  useEffect(() => {
    const container = document.getElementById(SBI_CONTAINER_ID);
    if (!container) return;

    let refreshFrameId = null;

    const scheduleRefresh = () => {
      if (refreshFrameId !== null) {
        cancelAnimationFrame(refreshFrameId);
      }
      refreshFrameId = requestAnimationFrame(() => {
        refreshFrameId = null;
        refreshEmbeddedSbiUi(container, formReady);
      });
    };

    scheduleRefresh();

    const observer = new MutationObserver((mutations) => {
      const shouldRefresh = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          return false;
        }
        if (mutation.target?.id === `deviceOption${FAYDA_DEVICE_ID}`) {
          return false;
        }
        if (
          mutation.target?.classList?.contains('sbd-dropdown__single-value')
        ) {
          return false;
        }
        return true;
      });

      if (!shouldRefresh) return;
      scheduleRefresh();
    });
    observer.observe(container, { childList: true, subtree: true });

    const handleContainerClick = (event) => {
      const option = event.target.closest('.sbd-dropdown__option');
      if (option?.id?.startsWith('deviceOption')) {
        userDeviceChoiceRef.current = true;
        selectedDeviceRef.current = option.id.replace('deviceOption', '');
      }

      const verifyButton = event.target.closest(
        '.sbd-verify-button-div button'
      );
      if (!verifyButton || verifyButton.disabled) return;

      if (isFaydaDeviceSelected()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        startInternalSbiVerification();
      }
    };

    container.addEventListener('click', handleContainerClick, true);
    return () => {
      if (refreshFrameId !== null) {
        cancelAnimationFrame(refreshFrameId);
      }
      observer.disconnect();
      container.removeEventListener('click', handleContainerClick, true);
    };
  }, [i18n.language, formReady, isErshaClient, faydaLabel]);

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data?.type) return;

      if (event.data.type === 'INTERNAL_SBI_VERIFY_RETRY') {
        if (
          internalRunIdRef.current &&
          event.data.runId &&
          event.data.runId !== internalRunIdRef.current
        ) {
          return;
        }
        setErrorBanner(null);
        setInternalSuccess(false);
        return;
      }

      if (event.data.type !== 'INTERNAL_SBI_VERIFY_RESULT') return;

      if (
        internalActiveIframeWindowRef.current &&
        event.source !== internalActiveIframeWindowRef.current
      ) {
        return;
      }

      if (
        internalRunIdRef.current &&
        event.data.runId !== internalRunIdRef.current
      ) {
        return;
      }

      if (
        event.data.resultSeq &&
        event.data.resultSeq <= internalResultSeqRef.current
      ) {
        return;
      }
      if (event.data.resultSeq) {
        internalResultSeqRef.current = event.data.resultSeq;
      }

      const { ok, payload, error } = event.data;

      if (!ok && !error && !payload) {
        return;
      }

      if (!ok) {
        setInternalModalOpen(false);
        setInternalSuccess(false);
        setErrorBanner({
          errorCode: error || 'authentication_failed_msg',
          show: true,
        });
        return;
      }

      setErrorBanner(null);
      setInternalModalOpen(false);

      let validation = { errorCode: null, defaultMsg: null };
      try {
        validation = validateBiometricResponse(payload);
      } catch {
        validation = {
          errorCode: 'authentication_failed_msg',
          defaultMsg: null,
        };
      }
      if (validation.errorCode !== null) {
        setInternalSuccess(false);
        setErrorBanner({
          errorCode: validation.defaultMsg || 'authentication_failed_msg',
          show: true,
        });
        return;
      }

      setInternalSuccess(true);
      try {
        await authenticateBiometricResponse(payload);
      } catch {
        setInternalSuccess(false);
        setErrorBanner({
          errorCode: 'authentication_failed_msg',
          show: true,
        });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!internalModalOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [internalModalOpen]);

  const onCloseHandle = () => {
    setErrorBanner(null);
  };

  return (
    <>
      <div className="flex items-center">{backButtonDiv}</div>
      {errorBanner !== null && (
        <div className="mb-4">
          <ErrorBanner
            showBanner={errorBanner.show}
            errorCode={t2(errorBanner.errorCode)}
            onCloseHandle={onCloseHandle}
          />
        </div>
      )}
      <LoginIDOptions
        currentLoginID={(value) => {
          setCurrentLoginID(value);
        }}
      />
      <form className="relative">
        {currentLoginID && (
          <>
            <div className="mt-0">
              {currentLoginID?.prefixes?.length > 0 ? (
                <InputWithPrefix
                  currentLoginID={currentLoginID}
                  login="sbi"
                  hideLabel={true}
                  countryCode={(val) => {
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
                inputFields.map((field) => (
                  <InputWithImage
                    key={'sbi_' + currentLoginID.id}
                    handleChange={handleChange}
                    blurChange={handleBlur}
                    labelText={currentLoginID.input_label}
                    hideLabel={true}
                    labelFor={'sbi_' + currentLoginID.id}
                    id={'sbi_' + currentLoginID.id}
                    name={'sbi_' + currentLoginID.id}
                    type={field.type}
                    placeholder={currentLoginID.input_placeholder}
                    customClass={inputCustomClass}
                    isRequired={field.isRequired}
                    tooltipMsg="vid_info"
                    individualId={individualId}
                    isInvalid={!isValid}
                    value={individualId ?? ''}
                    currenti18nPrefix={i18nKeyPrefix1}
                  />
                ))
              )}
            </div>

            {showCaptcha && (
              <div className="flex justify-center mt-5 mb-5">
                <ReCAPTCHA
                  hl={i18n.language}
                  ref={_reCaptchaRef}
                  onChange={handleCaptchaChange}
                  sitekey={captchaSiteKey}
                />
              </div>
            )}
          </>
        )}

        {status.state === states.LOADING && errorBanner === null && (
          <div className="my-2">
            <LoadingIndicator size="medium" message={status.msg} />
          </div>
        )}

        <div
          id={SBI_CONTAINER_ID}
          className={
            skipLocalSbi && isErshaClient ? 'sbi-mobile-face-only my-2' : 'my-2'
          }
        ></div>

        {internalSuccess && isFaydaDeviceSelected() && (
          <div className="w-full text-center text-sm font-semibold text-green-700 bg-green-100 rounded px-3 py-2 my-2">
            {t1('liveness_verified_success_msg')}
          </div>
        )}

        {internalModalOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-hidden={!internalModalOpen}
            >
              <div
                className="relative sbi-liveness-modal overflow-hidden rounded-2xl bg-[#1e293b] shadow-xl"
                style={{
                  width: SBI_LIVENESS_MODAL_SIZE,
                  height: SBI_LIVENESS_MODAL_SIZE,
                }}
              >
                <iframe
                  key={internalIframeKey}
                  ref={internalIframeRef}
                  title="Internal SBI Liveness"
                  className="h-full w-full border-0"
                  src={internalModalSrc}
                  allow="camera; microphone; picture-in-picture 'none'; fullscreen 'none'"
                  onLoad={() => {
                    internalActiveIframeWindowRef.current =
                      internalIframeRef.current?.contentWindow ?? null;
                    pushEmbedConfigToIframe();
                    setTimeout(pushEmbedConfigToIframe, 100);
                    setTimeout(pushEmbedConfigToIframe, 500);
                  }}
                />
              </div>
            </div>,
            document.body
          )}

        {status.state === states.AUTHENTICATING && errorBanner === null && (
          <div className="absolute bottom-0 left-0 bg-white bg-opacity-70 h-full w-full flex justify-center font-semibold">
            <div className="flex items-center my-2">
              <LoadingIndicator
                size="medium"
                message={status.msg}
                msgParam={status.msgParam}
              />
            </div>
          </div>
        )}
      </form>
    </>
  );
}

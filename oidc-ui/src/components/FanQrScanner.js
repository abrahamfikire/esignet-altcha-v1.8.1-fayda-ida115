import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QrScanner from '@agicash/qr-scanner';
import { useTranslation } from 'react-i18next';
import {
  extractFanFromQrPayload,
  getFanQrRegexPatterns,
} from '../services/fanQrParser';
import { isMobilePhone } from '../services/deviceUtils';

const WORKER_URL = `${process.env.PUBLIC_URL || ''}/qr-scanner-worker.js`;

let workerConfigured = false;

const ensureWorkerConfigured = () => {
  if (!workerConfigured) {
    QrScanner.setWorkerUrl(WORKER_URL);
    workerConfigured = true;
  }
};

const waitForLayout = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

const calculateFullScanRegion = (video) => ({
  x: 0,
  y: 0,
  width: video.videoWidth,
  height: video.videoHeight,
});

const getPreferredCameraFacingMode = () =>
  isMobilePhone() ? 'environment' : 'user';

const resolveBackCamera = async () => {
  const cameras = await QrScanner.listCameras(true);
  if (!cameras?.length) {
    return 'environment';
  }

  const backCamera = cameras.find(({ label }) =>
    /back|rear|environment|trás|arrière/i.test(label)
  );

  return backCamera?.id ?? cameras[cameras.length - 1].id;
};

const resolveFrontCamera = async () => {
  const cameras = await QrScanner.listCameras(true);
  if (!cameras?.length) {
    return 'user';
  }

  const frontCamera = cameras.find(({ label }) =>
    /front|user|face|facetime|integrated|built.?in|webcam/i.test(label)
  );

  return frontCamera?.id ?? cameras[0].id;
};

const resolvePreferredCamera = async () =>
  isMobilePhone() ? resolveBackCamera() : resolveFrontCamera();

const getErrorText = (error) =>
  String(error?.message || error?.name || error || '').toLowerCase();

const isCameraPermissionDenied = (error) => {
  const text = getErrorText(error);

  return (
    text.includes('notallowederror') ||
    text.includes('permissiondeniederror') ||
    text.includes('permission denied') ||
    text.includes('not allowed') ||
    text.includes('denied') ||
    text.includes('camerapermissionerror')
  );
};

const isInsecureCameraError = (error) => {
  const text = getErrorText(error);

  return (
    !window.isSecureContext ||
    text.includes('secure context') ||
    text.includes('only supported in secure')
  );
};

const CameraOutlineIcon = ({ size = 40, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

export default function FanQrScanner({
  open,
  onClose,
  onScan,
  openIDConnectService,
  i18nKeyPrefix = 'otp',
}) {
  const { t } = useTranslation('translation', { keyPrefix: i18nKeyPrefix });
  const scannerRef = useRef(null);
  const videoRef = useRef(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  const [scannerPhase, setScannerPhase] = useState('prompt');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  onScanRef.current = onScan;

  const stopScanner = useCallback(() => {
    handledRef.current = true;
    const activeScanner = scannerRef.current;
    scannerRef.current = null;
    if (activeScanner) {
      activeScanner.destroy();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    ensureWorkerConfigured();
    QrScanner.preload().catch(() => {});

    setError('');
    setScannerPhase('prompt');
    setTorchAvailable(false);
    setTorchOn(false);

    return () => {
      stopScanner();
    };
  }, [open, stopScanner]);

  const handleAllowCamera = async () => {
    if (!window.isSecureContext) {
      setScannerPhase('insecure');
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    setError('');
    setTorchAvailable(false);
    setTorchOn(false);
    setScannerPhase('scanning');
    handledRef.current = false;
    stopScanner();
    handledRef.current = false;

    await waitForLayout();

    ensureWorkerConfigured();

    const fanQrPatterns = getFanQrRegexPatterns(openIDConnectService);

    const onDecoded = (result) => {
      if (handledRef.current) {
        return;
      }

      const fan = extractFanFromQrPayload(result.data, fanQrPatterns);
      if (!fan) {
        setError(t('fan_qr_invalid'));
        return;
      }

      handledRef.current = true;
      const activeScanner = scannerRef.current;
      scannerRef.current = null;
      if (activeScanner) {
        activeScanner.stop();
      }
      onScanRef.current(fan);
    };

    const scannerOptions = {
      preferredCamera: getPreferredCameraFacingMode(),
      maxScansPerSecond: 10,
      calculateScanRegion: calculateFullScanRegion,
      cameraResolution: {
        width: { min: 640, ideal: 1920 },
        height: { min: 480, ideal: 1080 },
      },
      decoderOptions: {
        tryHarder: true,
        formats: ['QRCode'],
      },
      onDecodeError: () => {},
    };

    const startScanner = async (preferredCamera) => {
      const scanner = new QrScanner(video, onDecoded, {
        ...scannerOptions,
        preferredCamera,
      });
      scannerRef.current = scanner;
      await scanner.start();
      const hasFlash = await scanner.hasFlash();
      setTorchAvailable(hasFlash);
    };

    try {
      const preferredCamera = await resolvePreferredCamera();
      await startScanner(preferredCamera);
    } catch (firstErr) {
      if (handledRef.current) {
        return;
      }

      const failedScanner = scannerRef.current;
      scannerRef.current = null;
      if (failedScanner) {
        failedScanner.destroy();
      }

      try {
        await startScanner(getPreferredCameraFacingMode());
      } catch (err) {
        scannerRef.current = null;
        if (isInsecureCameraError(err) || isInsecureCameraError(firstErr)) {
          setScannerPhase('insecure');
        } else if (
          isCameraPermissionDenied(err) ||
          isCameraPermissionDenied(firstErr)
        ) {
          setScannerPhase('denied');
        } else {
          setError(t('fan_qr_camera_error'));
          setScannerPhase('error');
        }
      }
    }
  };

  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner || !torchAvailable) {
      return;
    }

    try {
      await scanner.toggleFlash();
      setTorchOn(scanner.isFlashOn());
    } catch {
      setTorchAvailable(false);
      setTorchOn(false);
    }
  };

  const showCameraPrompt =
    scannerPhase === 'prompt' ||
    scannerPhase === 'denied' ||
    scannerPhase === 'insecure' ||
    scannerPhase === 'error';

  const promptTitle =
    scannerPhase === 'denied'
      ? t('fan_qr_camera_denied_title')
      : scannerPhase === 'insecure'
        ? t('fan_qr_camera_denied_title')
        : t('fan_qr_camera_prompt_title');

  const promptMessage =
    scannerPhase === 'denied'
      ? t('fan_qr_camera_denied_message')
      : scannerPhase === 'insecure'
        ? t('fan_qr_camera_insecure_message')
        : scannerPhase === 'error'
          ? error || t('fan_qr_camera_error')
          : t('fan_qr_camera_prompt_message');

  const promptButtonLabel =
    scannerPhase === 'prompt'
      ? t('scan_fan_qr_allow_camera')
      : t('scan_fan_qr_retry');

  if (!open) {
    return null;
  }

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fan-qr-scanner-title"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[640px] flex-col overflow-y-auto rounded-2xl bg-[#0F4356] p-3 text-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3 sm:gap-3">
          <h2
            id="fan-qr-scanner-title"
            className="pr-2 text-base font-semibold leading-snug sm:text-lg"
          >
            {t('scan_fan_qr_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-1 text-sm bg-white/10 hover:bg-white/20"
            aria-label={t('scan_fan_qr_close')}
          >
            {t('scan_fan_qr_close')}
          </button>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-white/80 sm:text-sm">
          {scannerPhase === 'scanning'
            ? t('scan_fan_qr_scanning_hint')
            : t('scan_fan_qr_hint')}
        </p>

        <div className="fan-qr-scanner-viewport relative -mx-3 aspect-video w-[calc(100%+1.5rem)] max-h-[min(72dvh,720px)] overflow-hidden bg-black sm:mx-0 sm:w-full sm:rounded-xl">
          <video
            ref={videoRef}
            className="fan-qr-scanner-video absolute inset-0 h-full w-full"
            muted
            playsInline
            aria-hidden={showCameraPrompt}
          />
          {scannerPhase === 'scanning' && torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              className="absolute right-2 top-2 z-10 rounded-lg bg-black/50 px-3 py-1.5 text-xs font-medium hover:bg-black/70"
              aria-pressed={torchOn}
            >
              {torchOn ? t('scan_fan_qr_torch_off') : t('scan_fan_qr_torch_on')}
            </button>
          )}
          {showCameraPrompt && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-[#0a2a36] p-4 text-center sm:gap-4 sm:p-5">
              <CameraOutlineIcon
                size={40}
                className="shrink-0 text-white/90 sm:hidden"
              />
              <CameraOutlineIcon
                size={44}
                className="hidden shrink-0 text-white/90 sm:block"
              />
              <div className="space-y-2">
                <p className="text-sm font-semibold sm:text-base">
                  {promptTitle}
                </p>
                <p className="text-xs leading-relaxed text-white/80 sm:text-sm">
                  {promptMessage}
                </p>
              </div>
              {scannerPhase !== 'insecure' && (
                <button
                  type="button"
                  onClick={handleAllowCamera}
                  className="w-full max-w-xs rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/25 sm:w-auto"
                >
                  {promptButtonLabel}
                </button>
              )}
            </div>
          )}
        </div>

        {error && scannerPhase === 'scanning' && (
          <p
            className="mt-3 text-center text-xs text-red-200 sm:text-sm"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

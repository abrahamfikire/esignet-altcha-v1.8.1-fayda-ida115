import { configurationKeys } from '../constants/clientConstants';

const FAN_LENGTH = 16;
const PATTERN_SEPARATOR = '|';

// New QR (image + :DLT:...:A:FAN:D:...:SIGN:...) and old structured/plain formats.
const DEFAULT_FAN_QR_PATTERNS = [
  ':A:\\s*([^:]+?)\\s*:D:',
  '(\\d{4}\\s+\\d{4}\\s+\\d{4}\\s+\\d{4})',
  '^(\\d{16})$',
];

const normalizeFanDigits = (value) => {
  const fan = String(value ?? '').replace(/\D/g, '');
  return fan.length === FAN_LENGTH ? fan : null;
};

const parsePatternList = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) {
    return [];
  }

  return text
    .split(PATTERN_SEPARATOR)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
};

export function getFanQrRegexPatterns(openIDConnectService) {
  const fromConfig = openIDConnectService?.getEsignetConfiguration?.(
    configurationKeys.fanQrRegex
  );
  const fromRuntime = window._env_?.FAN_QR_REGEX;
  const fromEnv = process.env.REACT_APP_FAN_QR_REGEX;
  const configured = parsePatternList(fromConfig ?? fromRuntime ?? fromEnv);

  if (configured.length > 0) {
    return configured;
  }

  return [...DEFAULT_FAN_QR_PATTERNS];
}

/** @deprecated Use getFanQrRegexPatterns instead. */
export function getFanQrRegexPattern(openIDConnectService) {
  return getFanQrRegexPatterns(openIDConnectService)[0];
}

const extractWithPattern = (text, pattern) => {
  try {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);
    if (!match) {
      return null;
    }

    const captured = match[1] ?? match[0];
    return normalizeFanDigits(captured);
  } catch {
    return null;
  }
};

/**
 * Extract FAN/VID digits from raw QR payload.
 * Tries each regex pattern in order; uses the first valid 16-digit FAN found.
 */
export function extractFanFromQrPayload(raw, regexPatterns) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }

  const patterns = Array.isArray(regexPatterns)
    ? regexPatterns
    : parsePatternList(regexPatterns);

  const activePatterns =
    patterns.length > 0 ? patterns : DEFAULT_FAN_QR_PATTERNS;

  for (const pattern of activePatterns) {
    const fan = extractWithPattern(text, pattern);
    if (fan) {
      return fan;
    }
  }

  return null;
}

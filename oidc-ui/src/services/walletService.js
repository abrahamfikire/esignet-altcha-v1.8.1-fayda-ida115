import {
  validAuthFactors,
  walletConfigKeys,
  modalityIconPath,
  tooltips,
} from '../constants/clientConstants';

const wlaToAuthfactor = (wla) => {
  return {
    label: wla[walletConfigKeys.walletName],
    value: { ...wla, type: 'WLA' },
    icon: wla[walletConfigKeys.walletLogoUrl],
    id: `login_with_${wla[walletConfigKeys.walletName]
      .replace(' ', '_')
      .toLowerCase()}`,
  };
};

const toAuthfactor = (authFactor) => {
  return {
    label: authFactor[0].type,
    value: authFactor[0],
    icon:
      authFactor[0].type === 'PWD'
        ? modalityIconPath['PSWD']
        : modalityIconPath[authFactor[0].type],
    id: `login_with_${authFactor[0].type.toLowerCase()}`,
    tooltip: tooltips[authFactor[0].type],
  };
};

const getAllAuthFactors = (authFactors, wlaList) => {
  let loginOptions = [];
  (authFactors || []).forEach((authFactor) => {
    const authFactorType = authFactor[0].type;
    if (validAuthFactors[authFactorType] || authFactorType === 'PWD') {
      if (authFactorType === validAuthFactors.WLA) {
        wlaList.forEach((wla) => loginOptions.push(wlaToAuthfactor(wla)));
      } else {
        loginOptions.push(toAuthfactor(authFactor));
      }
    }
  });

  // VeriFayda: always offer TOTP next to Code (OTP) when the IdP did not send it.
  const hasType = (type) =>
    loginOptions.some((option) => option.value?.type === type);
  if (hasType(validAuthFactors.OTP) && !hasType(validAuthFactors.TOTP)) {
    loginOptions.push(toAuthfactor([{ type: validAuthFactors.TOTP }]));
  }

  // One button per factor (generated-code + faydapass-code both resolved to TOTP).
  const seenTypes = new Set();
  loginOptions = loginOptions.filter((option) => {
    const type = option.value?.type;
    if (!type || type === 'WLA') {
      return true;
    }
    if (seenTypes.has(type)) {
      return false;
    }
    seenTypes.add(type);
    return true;
  });

  // Preferred UI order: Code (OTP) → Biometrics → TOTP → others
  const preferredOrder = [
    validAuthFactors.OTP,
    validAuthFactors.BIO,
    validAuthFactors.TOTP,
    validAuthFactors.PIN,
    'PWD',
    validAuthFactors.KBI,
    validAuthFactors.WLA,
    validAuthFactors.IDT,
  ];
  loginOptions.sort((a, b) => {
    const typeA = a.value?.type || a.label;
    const typeB = b.value?.type || b.label;
    const indexA = preferredOrder.indexOf(typeA);
    const indexB = preferredOrder.indexOf(typeB);
    const orderA = indexA === -1 ? preferredOrder.length : indexA;
    const orderB = indexB === -1 ? preferredOrder.length : indexB;
    return orderA - orderB;
  });

  return loginOptions;
};

export { wlaToAuthfactor, toAuthfactor, getAllAuthFactors };

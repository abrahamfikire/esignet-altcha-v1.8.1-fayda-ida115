export const isAndroid = () => /Android/i.test(navigator.userAgent ?? '');

export const isMobilePhone = () =>
  /Android|iPhone|iPod/i.test(navigator.userAgent ?? '');

/** Local MOSIP SBI (127.0.0.1 port scan) is desktop-only. */
export const shouldSkipLocalSbiDiscovery = () => isAndroid();

import { useTranslation } from 'react-i18next';

export default function Background({
  clientLogoPath,
  clientName,
  component,
  i18nKeyPrefix = 'header',
}) {
  const { t } = useTranslation('translation', {
    keyPrefix: i18nKeyPrefix,
  });

  return (
    <div className="h-fit w-full space-y-5">
      <div className="rounded-[6px] bg-white/10 backdrop-blur-2xl border border-white/30 ring-1 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col p-5">
        <div className="w-full flex justify-center items-center space-x-2">
          {clientLogoPath && (
            <img
              className="object-contain client-logo-size"
              src={clientLogoPath}
              alt={clientName}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/logo.png?v=20260901h';
              }}
            />
          )}
          <img
            className="object-contain data-exchange w-10 aspect-video"
            alt={t('logo_alt')}
          />
          <img
            className="object-contain brand-only-logo client-logo-size"
            src="/logo.png?v=20260901h"
            alt={t('logo_alt')}
          />
        </div>
      </div>
      <div className="rounded-[6px] bg-white/10 backdrop-blur-2xl border border-white/30 ring-1 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col py-6 md:py-10 !px-5">
        {component}
      </div>
    </div>
  );
}

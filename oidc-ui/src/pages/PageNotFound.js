import React from 'react';
import { useTranslation } from 'react-i18next';

export default function PageNotFoundPage({ i18nKeyPrefix = 'errors' }) {
  const { t } = useTranslation('translation', { keyPrefix: i18nKeyPrefix });

  return (
    <div className="w-full py-24 rounded-[6px] bg-white/10 backdrop-blur-2xl border border-white/30 ring-1 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col justify-center items-center px-5">
      <img
        className="mx-auto my-0"
        src="images/under_construction.svg"
        alt="page_not_found"
      />
      <div className="error-page-header !text-white">{t('page_not_exist')}</div>
    </div>
  );
}

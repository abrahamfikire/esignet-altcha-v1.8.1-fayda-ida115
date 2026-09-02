import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

export default function SomethingWrongPage({ i18nKeyPrefix = 'errors' }) {
  const { t } = useTranslation('translation', { keyPrefix: i18nKeyPrefix });
  const statusCode = useLocation().state?.code;
  return (
    <div className="w-full py-24 rounded-[6px] bg-white/10 backdrop-blur-2xl border border-white/30 ring-1 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col px-5">
      <img
        className="mx-auto my-0"
        src="images/under_construction.svg"
        alt="something_went_wrong"
      />
      <div className="error-page-header !text-white">
        {t('statusCodeHeader.' + statusCode)}
      </div>
      <div className="error-page-detail !text-white/80">
        {t('statusCodeSubHeader.' + statusCode)}
      </div>
    </div>
  );
}

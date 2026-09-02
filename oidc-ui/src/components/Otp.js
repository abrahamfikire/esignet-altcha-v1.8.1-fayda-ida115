import { useState } from 'react';
import OtpGet from './OtpGet';
import OtpVerify from './OtpVerify';

const OTPStatusEnum = {
  getOtp: 'GETOTP',
  verifyOtp: 'VERIFYOTP',
};

export default function Otp({
  param,
  authService,
  openIDConnectService,
  backButtonDiv,
}) {
  const [otpStatus, setOtpStatus] = useState(OTPStatusEnum.getOtp);
  const [otpResponse, setOtpResponse] = useState('');
  const [ID, setId] = useState('');
  const [currentLoginID, setCurrentLoginID] = useState('');
  const [selectedCountryOption, setSelectedCountryOption] = useState('');

  const onOtpSent = async (ID, response, loginID, selectedCountry) => {
    setId(ID);
    setOtpResponse(response);
    setOtpStatus(OTPStatusEnum.verifyOtp);
    setCurrentLoginID(loginID);
    setSelectedCountryOption(selectedCountry);
  };

  return (
    <>
      <div className="flex items-center">
        {otpStatus === OTPStatusEnum.verifyOtp ? (
          <div className="h-6 text-center flex items-start">
            <button
              id="back-button"
              type="button"
              onClick={() => setOtpStatus(OTPStatusEnum.getOtp)}
              className="text-2xl font-semibold justify-left rtl:rotate-180 !text-white"
              aria-label="back"
            >
              &#8592;
            </button>
          </div>
        ) : (
          backButtonDiv
        )}
      </div>

      {otpStatus === OTPStatusEnum.getOtp && (
        <OtpGet
          param={param}
          authService={authService}
          openIDConnectService={openIDConnectService}
          onOtpSent={onOtpSent}
        />
      )}

      {otpStatus === OTPStatusEnum.verifyOtp && (
        <OtpVerify
          param={param}
          otpResponse={otpResponse}
          ID={ID}
          loginID={currentLoginID}
          selectedCountry={selectedCountryOption}
          authService={authService}
          openIDConnectService={openIDConnectService}
        />
      )}
    </>
  );
}

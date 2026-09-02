import { Suspense, useEffect, useState } from 'react';
import { Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import {
  LoginPage,
  AuthorizePage,
  ConsentPage,
  EsignetDetailsPage,
  SomethingWrongPage,
  PageNotFoundPage,
} from '../pages';
import { setupResponseInterceptor } from '../services/api.service';
import { useTranslation } from 'react-i18next';
import {
  AUTHORIZE,
  CONSENT,
  LOGIN,
  PAGE_NOT_FOUND,
  SOMETHING_WENT_WRONG,
  ESIGNET_DETAIL,
  CLAIM_DETAIL,
  NETWORK_ERROR,
} from '../constants/routes';
import configService from '../services/configService';
import ClaimDetails from '../components/ClaimDetails';
import NetworkError from '../pages/NetworkError';
import { Detector } from 'react-detect-offline';
import { getPollingConfig } from '../helpers/utils';
import LoadingIndicator from '../common/LoadingIndicator';
import Footer from '../components/Footer';

const WithSuspense = ({ children }) => (
  <Suspense fallback={<div className="h-screen w-screen bg-neutral-100"></div>}>
    {children}
  </Suspense>
);

export const AppRouter = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  const [config, setConfig] = useState(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const pollingConfig = getPollingConfig();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const appConfig = await configService();
        setConfig(appConfig);
      } catch (error) {
        console.error('Failed to fetch config:', error);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (location.pathname !== NETWORK_ERROR) {
      setCurrentUrl(window.location.href);
    }
  }, [location.pathname]);

  useEffect(() => {
    setupResponseInterceptor(navigate);
  }, [navigate]);

  if (window.location.pathname === CLAIM_DETAIL) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'unset';
  }

  const checkRoute = (currentRoute) =>
    [LOGIN, AUTHORIZE, CONSENT, NETWORK_ERROR].includes(currentRoute);

  if (isLoadingConfig) {
    return (
      <div className="h-screen flex justify-center content-center">
        <LoadingIndicator
          size="medium"
          message={'loading_msg'}
          className="align-loading-center"
        />
      </div>
    );
  }

  const backgroundLogoDiv = checkRoute(location.pathname) ? (
    config && config['background_logo'] ? (
      <div className="flex justify-center m-10 lg:mt-20 mb:mt-0 lg:w-1/2 md:w-1/2 md:block sm:w-1/2 sm:block hidden w-5/6 mt-20 mb-10 md:mb-0">
        <img
          className="background-logo object-contain rtl:scale-x-[-1]"
          alt={t('header.backgroud_image_alt')}
        />
      </div>
    ) : null
  ) : null;

  const esignetRoutes = [
    { route: ESIGNET_DETAIL, component: <EsignetDetailsPage /> },
    { route: LOGIN, component: <LoginPage /> },
    { route: AUTHORIZE, component: <AuthorizePage /> },
    { route: CONSENT, component: <ConsentPage /> },
    { route: CLAIM_DETAIL, component: <ClaimDetails /> },
    { route: SOMETHING_WENT_WRONG, component: <SomethingWrongPage /> },
    { route: NETWORK_ERROR, component: <NetworkError /> },
    { route: PAGE_NOT_FOUND, component: <PageNotFoundPage /> },
    { route: '*', component: <PageNotFoundPage /> },
  ];

  return (
    <WithSuspense>
      <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        <section
          className="oidc-scroll-main login-text body-font relative bg-cover bg-center"
          style={{
            backgroundImage: "url('/images/background.svg')",
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-[40%] z-30 bg-gradient-to-t from-white/40 to-transparent" />

          <Detector
            polling={{
              url: pollingConfig.url,
              interval: pollingConfig.interval,
              timeout: pollingConfig.timeout,
              enabled: pollingConfig.enabled,
            }}
            render={({ online }) => {
              if (!online) {
                navigate(NETWORK_ERROR, {
                  state: {
                    path: currentUrl,
                  },
                });
              }
            }}
          />

          <div className="oidc-page-content relative z-40 flex w-full flex-col items-center px-4 py-4 sm:min-h-full sm:justify-center sm:px-5 sm:py-10">
            {backgroundLogoDiv}
            <div className="w-full max-w-[500px]">
              <Routes>
                {esignetRoutes.map((route) => (
                  <Route
                    exact
                    key={route.route}
                    path={process.env.PUBLIC_URL + route.route}
                    element={route.component}
                  />
                ))}
              </Routes>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    </WithSuspense>
  );
};

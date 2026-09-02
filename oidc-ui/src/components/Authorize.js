import React from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ErrorIndicator from '../common/ErrorIndicator';
import LoadingIndicator from '../common/LoadingIndicator';
import { LoadingStates as states } from '../constants/states';

// Deduplicate oauth-details under React.StrictMode (dev double-mount).
const oauthDetailsInFlight = new Map();

export default function Authorize({ authService }) {
  const post_OauthDetails_v3 = authService.post_OauthDetails_v3;
  const post_ParOauthDetails = authService.post_ParOauthDetails;
  const buildRedirectParams = authService.buildRedirectParamsV2;
  const storeQueryParam = authService.storeQueryParam;

  const [status, setStatus] = useState(states.LOADING);
  const [oAuthDetailResponse, setOAuthDetailResponse] = useState(null);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const callAuthorize = async () => {
      const requestKey = searchParams.toString();
      try {
        setStatus(states.LOADING);

        const handleResponse = async (oAuthDetailsResponse) => {
          setStatus(states.LOADED);
          if (oAuthDetailsResponse.errors.length === 0) {
            setOAuthDetailResponse(oAuthDetailsResponse);
          } else {
            setOAuthDetailResponse(null);
            setError(oAuthDetailsResponse.errors[0].errorCode);
            setStatus(states.ERROR);
          }
        };

        if (oauthDetailsInFlight.has(requestKey)) {
          await oauthDetailsInFlight.get(requestKey).then(handleResponse);
          return;
        }

        const clientId = searchParams.get('client_id');
        const requestUri = searchParams.get('request_uri');

        const isParFlow =
          clientId && requestUri && [...searchParams.keys()].length === 2;

        let detailsPromise;
        if (isParFlow) {
          storeQueryParam(searchParams.toString());
          const payload = { clientId, requestUri };
          detailsPromise = post_ParOauthDetails(payload);
        } else {
          const extractParam = (param) => searchParams.get(param);

          const request = {
            nonce: extractParam('nonce'),
            state: extractParam('state'),
            clientId: extractParam('client_id'),
            redirectUri: extractParam('redirect_uri'),
            responseType: extractParam('response_type'),
            scope: extractParam('scope'),
            acrValues: extractParam('acr_values'),
            claims: extractParam('claims'),
            claimsLocales: extractParam('claims_locales'),
            display: extractParam('display'),
            maxAge: extractParam('max_age'),
            prompt: extractParam('prompt'),
            uiLocales: extractParam('ui_locales'),
            codeChallenge: extractParam('code_challenge'),
            codeChallengeMethod: extractParam('code_challenge_method'),
            idTokenHint: extractParam('id_token_hint'),
          };

          let claimsDecoded = null;
          if (request.claims) {
            try {
              claimsDecoded = JSON.parse(decodeURI(request.claims));
            } catch {
              setError('parsing_error_msg');
              setStatus(states.ERROR);
              return;
            }
          }

          storeQueryParam(searchParams.toString());

          const filteredRequest = Object.fromEntries(
            Object.entries({ ...request, claims: claimsDecoded }).filter(
              ([, value]) => value !== null
            )
          );

          detailsPromise = post_OauthDetails_v3(filteredRequest);
        }

        oauthDetailsInFlight.set(requestKey, detailsPromise);
        try {
          await detailsPromise.then(handleResponse);
        } finally {
          // Keep briefly so StrictMode remount can reuse; clear after settle.
          setTimeout(() => oauthDetailsInFlight.delete(requestKey), 5000);
        }
      } catch (error) {
        oauthDetailsInFlight.delete(requestKey);
        setStatus(states.LOADED);
        setOAuthDetailResponse(null);
        setError(error.message);
        setStatus(states.ERROR);
      }
    };

    callAuthorize();
  }, []);

  useEffect(() => {
    if (status === states.LOADED) {
      redirectToLogin();
    }
  }, [status]);

  const redirectToLogin = async () => {
    const isParFlow =
      searchParams.get('client_id') &&
      searchParams.get('request_uri') &&
      [...searchParams.keys()].length === 2;

    if (!oAuthDetailResponse) {
      return;
    }

    const { response, errors } = oAuthDetailResponse;

    if (!response) {
      return;
    }

    if (errors !== null && errors.length > 0) {
      return;
    } else {
      try {
        let params = buildRedirectParams({
          nonce: isParFlow ? null : searchParams.get('nonce'),
          state: isParFlow ? null : searchParams.get('state'),
          oauthResponse: response,
          ui_locales: searchParams.get('ui_locales'),
        });

        window.location.replace(process.env.PUBLIC_URL + '/login' + params);
      } catch (error) {
        setOAuthDetailResponse(null);
        setError('Failed to load');
        setStatus(states.ERROR);
      }
    }
  };

  let el;

  switch (status) {
    case states.LOADING:
      el = (
        <LoadingIndicator
          size="medium"
          message={'loading_msg'}
          className="align-loading-center"
        />
      );
      break;
    case states.LOADED: {
      if (!oAuthDetailResponse) {
        el = (
          <ErrorIndicator
            errorCode="no_response_msg"
            defaultMsg="No response"
          />
        );
        break;
      }

      const { errors } = oAuthDetailResponse;

      if (errors !== null && errors.length > 0) {
        el = errors?.map(({ errorCode, errorMessage }, idx) => (
          <div key={idx}>
            <ErrorIndicator errorCode={errorCode} defaultMsg={errorMessage} />
          </div>
        ));
      }
      break;
    }
    case states.ERROR:
      el = <ErrorIndicator errorCode={error} defaultMsg={error} />;
      break;
  }

  return el;
}

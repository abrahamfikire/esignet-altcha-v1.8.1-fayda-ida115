const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Local CRA proxy for eSignet API.
 * VeriFayda branding (locales/theme/images) is served from oidc-ui/public after:
 *   ./docker-compose/scripts/sync-artifactory-to-oidc-ui.sh
 *
 * Optional live artifactory overlay (only if ARTIFACTORY_PROXY=1):
 *   ARTIFACTORY_ORIGIN=http://localhost:8080 ARTIFACTORY_PROXY=1 npm start
 */
module.exports = function (app) {
  if (process.env.ARTIFACTORY_PROXY === '1') {
    const artifactoryOrigin =
      process.env.ARTIFACTORY_ORIGIN || 'http://localhost:8080';
    app.use(
      ['/locales', '/theme', '/images', '/logo.png', '/favicon.ico'],
      createProxyMiddleware({
        target: artifactoryOrigin,
        changeOrigin: true,
        secure: false,
        logLevel: 'warn',
      })
    );
  }

  app.use(
    '/v1/esignet',
    createProxyMiddleware({
      target: process.env.ESIGNET_ORIGIN || 'http://localhost:8088',
      changeOrigin: true,
      secure: false,
    })
  );
};

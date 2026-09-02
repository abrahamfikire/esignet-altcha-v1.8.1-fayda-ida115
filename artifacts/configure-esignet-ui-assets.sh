#!/bin/sh
set -e

mkdir -p "${i18n_zip_path}" "${theme_zip_path}" "${image_zip_path}"

I18N="${work_dir}/src/i18n/esignet-i18n-bundle"
THEME="${work_dir}/src/theme/esignet-theme"
IMAGE="${work_dir}/src/image/esignet-image"

cd "${I18N}" && zip -r -j "${i18n_zip_path}/esignet-i18n-bundle.zip" .
cd "${THEME}" && zip -r -j "${theme_zip_path}/esignet-theme.zip" .
cd "${IMAGE}" && zip -r "${image_zip_path}/esignet-image.zip" .

# Dev-style direct paths (optional consumers)
mkdir -p /usr/share/nginx/html/locales /usr/share/nginx/html/theme /usr/share/nginx/html/images
cp -a "${I18N}/." /usr/share/nginx/html/locales/
cp -a "${THEME}/." /usr/share/nginx/html/theme/
cp -a "${IMAGE}/." /usr/share/nginx/html/images/
cp -f "${IMAGE}/logo.png" /usr/share/nginx/html/logo.png 2>/dev/null || true

echo "esignet-ui-assets ready:"
ls -la "${i18n_zip_path}/esignet-i18n-bundle.zip" \
      "${theme_zip_path}/esignet-theme.zip" \
      "${image_zip_path}/esignet-image.zip"

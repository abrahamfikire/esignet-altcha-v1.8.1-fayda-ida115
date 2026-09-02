#!/bin/sh
# Fetch VeriFayda branding from local artifactory, then start nginx.
set -e

HTML_DIR="${nginx_dir:-/usr/share/nginx}/html"
I18N_DIR="${HTML_DIR}/locales"
THEME_DIR="${HTML_DIR}/theme"
IMAGE_DIR="${HTML_DIR}/images"

mkdir -p "$I18N_DIR" "$THEME_DIR" "$IMAGE_DIR" "${HTML_DIR}/plugins" || true

fetch_unzip() {
  url="$1"
  dest="$2"
  name="$3"
  if [ -z "$url" ]; then
    echo "skip $name (url empty)"
    return 0
  fi
  echo "Fetching $name from $url"
  if wget --no-check-certificate --no-cache --no-cookies -O "/tmp/${name}.zip" "$url"; then
    unzip -o "/tmp/${name}.zip" -d "$dest"
    rm -f "/tmp/${name}.zip"
    echo "Applied $name"
  else
    echo "WARN: failed to fetch $name — keeping existing files"
  fi
}

fetch_unzip "${i18n_url_env}" "$I18N_DIR" "esignet-i18n-bundle"
fetch_unzip "${theme_url_env}" "$THEME_DIR" "esignet-theme"
fetch_unzip "${images_url_env}" "$IMAGE_DIR" "esignet-image"

# Optional sign-in plugin (ignore if missing in custom builds)
if [ -f "${HTML_DIR}/plugins/temp/sign-in-button-plugin.zip" ]; then
  cd "${HTML_DIR}/plugins/temp"
  unzip -o sign-in-button-plugin.zip || true
  if [ -f sign-in-with-esignet/iife/index.js ]; then
    mv -f sign-in-with-esignet/iife/index.js "${HTML_DIR}/plugins/sign-in-button-plugin.js" || true
  fi
  rm -rf "${HTML_DIR}/plugins/temp" || true
fi

# Keep VeriFayda title defaults if env not already baked
if [ -n "${DEFAULT_TITLE}" ] && [ -f "${HTML_DIR}/env-config.js" ]; then
  echo "DEFAULT_TITLE=${DEFAULT_TITLE}"
fi

echo "starting nginx"
nginx
sleep infinity

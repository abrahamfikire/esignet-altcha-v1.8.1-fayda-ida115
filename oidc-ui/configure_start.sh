#!/bin/bash

#installs the pre-requisites.
set -e

echo "Downloading pre-requisites started."

# Check if $i18n_url_env is not empty
if [[ -n "$i18n_url_env" ]]; then
    echo "i18n_url_env is set: $i18n_url_env"
    wget --no-check-certificate --no-cache --no-cookies $i18n_url_env -O $i18n_path/esignet-i18n-bundle.zip

    echo "unzip i18n bundle files.."
    chmod 775 $i18n_path/*
    cd $i18n_path
    unzip -o esignet-i18n-bundle.zip
    rm esignet-i18n-bundle.zip
    echo "unzip i18n bundle completed."
fi

# Check if $theme_url_env is not empty
if [[ -n "$theme_url_env" ]]; then
    echo "theme_url_env is set: $theme_url_env"
    wget --no-check-certificate --no-cache --no-cookies $theme_url_env -O $theme_path/esignet-theme.zip

    echo "unzip theme files.."
    chmod 775 $theme_path/*
    cd $theme_path
    unzip -o esignet-theme.zip
    rm esignet-theme.zip
    echo "unzip theme completed."
fi

# Check if $images_url_env is not empty
if [[ -n "$images_url_env" ]]; then
    echo "images_url_env is set: $images_url_env"
    wget --no-check-certificate --no-cache --no-cookies $images_url_env -O $image_path/esignet-image.zip

    echo "unzip image files.."
    chmod 775 $image_path/*
    cd $image_path
    unzip -o esignet-image.zip
    rm esignet-image.zip
    echo "unzip image completed."
fi

# Do not copy image_path/logo.png over the baked VeriFayda circular header icon.
# Artifactory zips have used the MOSIP eSignet wordmark as logo.png.

#sign-in-button-plugin (skip on container restart if already extracted)
echo "unzip plugins.."
if [ -f "$plugins_path/temp/sign-in-button-plugin.zip" ]; then
  cd $plugins_path/temp
  unzip -o sign-in-button-plugin.zip
  rm sign-in-button-plugin.zip
  mv $plugins_path/temp/sign-in-with-esignet/$plugins_format/index.js $plugins_path/sign-in-button-plugin.js
  cd $plugins_path
  rm -r temp
elif [ -f "$plugins_path/sign-in-button-plugin.js" ]; then
  echo "sign-in-button-plugin.js already present, skipping unzip."
else
  echo "WARNING: sign-in-button-plugin.zip not found; continuing without it."
fi

echo "Pre-requisites download completed."

echo "Replacing public url placeholder with public url"

workingDir=$nginx_dir/html
replace_public_url() {
  local dir="$1"
  local cmd="$2"
  if grep -rl '_PUBLIC_URL_' "$dir" >/dev/null 2>&1; then
    grep -rl '_PUBLIC_URL_' "$dir" | xargs sed -i "$cmd"
  else
    echo "No _PUBLIC_URL_ placeholders left (ok on restart)."
  fi
}
if [ -z "$OIDC_UI_PUBLIC_URL" ]; then
  replace_public_url "$workingDir" "s/_PUBLIC_URL_//g"
else
  workingDir=$nginx_dir/${OIDC_UI_PUBLIC_URL}
  mkdir -p $workingDir
  mv -v $nginx_dir/html/* $workingDir/ 2>/dev/null || true
  replace_public_url "$workingDir" "s/_PUBLIC_URL_/\/${OIDC_UI_PUBLIC_URL}/g"
fi

echo "Replacing completed."

vf_assets="/verifayda-assets"
if [ ! -d "$vf_assets" ] || { [ ! -f "$vf_assets/totp-setup.js" ] && [ ! -d "$vf_assets/images" ]; }; then
  vf_assets="/verifayda-baked"
  echo "Using baked VeriFayda assets from $vf_assets"
fi

# Always restore VeriFayda images. The MOSIP image and artifactory zips ship
# the eSignet wordmark, a missing TOTP icon, and MOSIP language lists.
mkdir -p "$workingDir/images"
if [ -d "$vf_assets"/images ]; then
  cp -f "$vf_assets"/images/* "$workingDir/images/" 2>/dev/null || true
fi
if [ -f "$vf_assets"/logo.png ]; then
  cp -f "$vf_assets"/logo.png "$workingDir/logo.png"
  cp -f "$vf_assets"/logo.png "$workingDir/images/brand_logo.png"
  cp -f "$vf_assets"/logo.png "$workingDir/images/logo.png"
elif [ -f "$vf_assets"/images/logo.png ]; then
  cp -f "$vf_assets"/images/logo.png "$workingDir/logo.png"
  cp -f "$vf_assets"/images/logo.png "$workingDir/images/brand_logo.png"
  cp -f "$vf_assets"/images/logo.png "$workingDir/images/logo.png"
fi
if [ -f "$vf_assets"/footer_logo.png ]; then
  cp -f "$vf_assets"/footer_logo.png "$workingDir/images/footer_logo.png"
fi
if [ -f "$vf_assets"/demo-client-logo.png ]; then
  cp -f "$vf_assets"/demo-client-logo.png "$workingDir/images/demo-client-logo.png"
fi
if [ -f "$vf_assets"/images/totp_icon.png ]; then
  cp -f "$vf_assets"/images/totp_icon.png "$workingDir/images/totp_icon.png"
fi
# Keep the wide VeriFayda wordmark as top_logo.png (unused by header).
# Header + login-card brand use circular logo.png — do not overwrite it.
if [ -f "$vf_assets"/images/top_logo.png ]; then
  cp -f "$vf_assets"/images/top_logo.png "$workingDir/images/top_logo.png"
fi

# Docker image JS: TOTP icon, one TOTP button, cache-bust locales.
if ls "$workingDir"/static/js/main.*.js >/dev/null 2>&1; then
  sed -i 's|/images/faydapass_icon.svg|/images/totp_icon.png|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/images/totp_icon\.svg|/images/totp_icon.png|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/images/sign_in_with_otp.png|/images/otp_icon.svg|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/images/totp_icon\.png[^"]*|/images/totp_icon.png?v=20260902w|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/images/bio_icon\.svg[^"]*|/images/bio_icon.svg?v=20260902w|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/images/otp_icon\.svg[^"]*|/images/otp_icon.svg?v=20260902w|g' "$workingDir"/static/js/main.*.js || true
  # Skip a second button when authFactors already contains that type (OTP+TOTP ACR overlap).
  sed -i 's/:n.push(this.toAuthfactor(e)))}),n}/:n.some(o=>o.value\&\&o.value.type===t)||n.push(this.toAuthfactor(e)))}),n}/' "$workingDir"/static/js/main.*.js || true
  sed -i 's/Invalid Individual ID/Invalid FAN or FCN/g' "$workingDir"/static/js/main.*.js || true
  sed -i 's#s(e.tooltip.question)#s(e.tooltip.question,{defaultValue:{otp_tooltip_question:"What is OTP or Code?",totp_tooltip_question:"What is TOTP Code?",bio_tooltip_question:"What is Biometrics?"}[e.tooltip.question]||e.tooltip.question})#' "$workingDir"/static/js/main.*.js || true
  sed -i 's|--brand-logo-url":Sg+"/images/brand_logo.png"|--brand-logo-url":Sg+"/logo.png?v=20260902f"|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|--brand-only-logo-url":Sg+"/logo.png"|--brand-only-logo-url":Sg+"/logo.png?v=20260902f"|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|className:"brand-logo",alt:"brand_logo"|className:"brand-logo",src:"/logo.png?v=20260902f",alt:"brand_logo"|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|className:"mb-4 h-20 brand-only-logo",alt:"brand-logo"|className:"mb-4 h-20 brand-only-logo",src:"/logo.png?v=20260902f",alt:"brand-logo"|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|className:"footer-brand-logo",alt:|className:"footer-brand-logo",src:"/images/footer_logo.png?v=20260902f",alt:|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|brand-only-logo client-logo-size",alt:|brand-only-logo client-logo-size",src:"/logo.png?v=20260902f",alt:|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|className:"object-contain client-logo-size",src:t,alt:n}|className:"object-contain client-logo-size",src:t,alt:n,onError:function(e){e.target.onerror=null;e.target.src="/images/demo-client-logo.png?v=20260902f"}}|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|className:"client-logo-size",src:|className:"client-logo-size",onError:function(e){e.target.onerror=null;e.target.src="/images/demo-client-logo.png?v=20260902f"},src:|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|--footer-brand-logo-url":Sg+"/images/footer_logo.png"|--footer-brand-logo-url":Sg+"/images/footer_logo.png?v=20260902f"|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json?v=20260901c"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json?v=20260901e"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json?v=20260901f"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json?v=20260901g"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json?v=20260901h"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json?v=20260902a"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|loadPath:"/locales/{{lng}}.json"|loadPath:"/locales/{{lng}}.json?v=20260902f"|' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/locales/default.json?v=20260901h|/locales/default.json?v=20260902f|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/locales/default.json?v=20260902a|/locales/default.json?v=20260902f|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|/locales/default.json|/locales/default.json?v=20260902f|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260901h|20260902j|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902a|20260902j|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902f|20260902j|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902s|20260902t|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902r|20260902t|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902q|20260902t|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902p|20260902t|g' "$workingDir"/static/js/main.*.js || true
  sed -i 's|20260902n|20260902t|g' "$workingDir"/static/js/main.*.js || true
  # Authorize → login: full page load so #oauth payload is visible to Login on first paint.
  sed -i 's|h("/login"+n,{replace:!0})|window.location.replace("/login"+n)|g' "$workingDir"/static/js/main.*.js || true
  # Login: read OAuth hash from window.location (RR client-nav drops useLocation().hash).
  if ls "$workingDir"/static/js/main.*.js >/dev/null 2>&1; then
    node - "$workingDir"/static/js/main.*.js <<'NODE'
const fs = require("fs");
const files = process.argv.slice(2);
const oldHash =
  'hp.from(null!==(n=x.hash)&&void 0!==n?n:"","base64")';
const newHash =
  'hp.from((function(){var h=x.hash||window.location.hash||"";return"#"===h.charAt(0)?h.slice(1):h})(),"base64")';
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  if (text.includes(oldHash)) {
    text = text.replace(oldHash, newHash);
    changed = true;
    console.log("patched login hash decode in", file);
  }
  const oldCfg = "this.oAuthDetails.configs[e]";
  const newCfg = "(this.oAuthDetails&&this.oAuthDetails.configs||{})[e]";
  if (text.includes(oldCfg)) {
    text = text.split(oldCfg).join(newCfg);
    changed = true;
    console.log("patched oauth configs guard in", file);
  }
  if (changed) fs.writeFileSync(file, text);
}
NODE
  fi
fi
if [ -f "$vf_assets"/totp-setup.js ]; then
  cp -f "$vf_assets"/totp-setup.js "$workingDir/totp-setup.js"
fi
if [ -f "$vf_assets"/verifayda-ui-fix.js ]; then
  cp -f "$vf_assets"/verifayda-ui-fix.js "$workingDir/verifayda-ui-fix.js"
fi
if ls "$workingDir"/locales/*.json >/dev/null 2>&1 && [ -w "$workingDir/locales" ]; then
  sed -i 's/Invalid Individual ID/Invalid FAN or FCN/g' "$workingDir"/locales/*.json || true
fi

echo "generating env-config file"

echo "window._env_ = {" > ${workingDir}/env-config.js
awk -F '=' '{ print $1 ": \"" (ENVIRON[$1] ? ENVIRON[$1] : $2) "\"," }' ${workingDir}/env.env >> ${workingDir}/env-config.js
echo "}" >> ${workingDir}/env-config.js

echo "generation of env-config file completed!"

# VeriFayda theme overrides (visible TOTP digits, login icons, footer/header logos).
if [ -f "$workingDir/theme/verifayda-overrides.css" ]; then
  sed -i 's|/theme/verifayda-overrides.css?v=[^"]*|/theme/verifayda-overrides.css?v=20260903b|g' "$workingDir/index.html" 2>/dev/null || true
  if ! grep -q 'verifayda-overrides.css' "$workingDir/index.html" 2>/dev/null; then
    sed -i 's|</head>|<link rel="stylesheet" href="/theme/verifayda-overrides.css?v=20260903b"></head>|' "$workingDir/index.html" || true
  fi
fi

# Broken RP logos: load fixes from external JS (never inline — awk # comments break scripts).
UI_FIX_VER="20260903b"
if [ -f "$workingDir/index.html" ]; then
  tmp_html="${workingDir}/index.html.fallback"
  awk -v ver="$UI_FIX_VER" '
    BEGIN {
      s = "<script src=\"/verifayda-ui-fix.js?v=" ver "\"></script>"
      s2 = "<script src=\"/totp-setup.js?v=" ver "\"></script>"
    }
    {
      low = tolower($0)
      d = index(low, "<!doctype")
      if (d > 0) {
        $0 = substr($0, d)
        found = 1
      }
      if (!found) next
      while ((i = index($0, "<script id=\"client-logo-fallback\">")) > 0) {
        rest = substr($0, i)
        j = index(rest, "</script>")
        if (j == 0) { $0 = substr($0, 1, i-1); break }
        $0 = substr($0, 1, i-1) substr(rest, j + 9)
      }
      while ((i = index($0, "<script id=\"verifayda-ui-fix\">")) > 0) {
        rest = substr($0, i)
        j = index(rest, "</script>")
        if (j == 0) { $0 = substr($0, 1, i-1); break }
        $0 = substr($0, 1, i-1) substr(rest, j + 9)
      }
      while ((i = index($0, "<script src=\"/verifayda-ui-fix.js")) > 0) {
        rest = substr($0, i)
        j = index(rest, "</script>")
        if (j == 0) { $0 = substr($0, 1, i-1); break }
        $0 = substr($0, 1, i-1) substr(rest, j + 9)
      }
      while ((i = index($0, "<script src=\"/totp-setup.js")) > 0) {
        rest = substr($0, i)
        j = index(rest, "</script>")
        if (j == 0) { $0 = substr($0, 1, i-1); break }
        $0 = substr($0, 1, i-1) substr(rest, j + 9)
      }
      buf = buf $0
    }
    END {
      p = index(buf, "</head>")
      if (p > 0) {
        printf "%s%s%s%s\n", substr(buf, 1, p-1), s, s2, substr(buf, p)
      } else {
        p = index(buf, "</body>")
        if (p > 0) {
          printf "%s%s%s%s\n", substr(buf, 1, p-1), s, s2, substr(buf, p)
        } else {
          print buf s s2
        }
      }
    }
  ' "$workingDir/index.html" > "$tmp_html" && mv "$tmp_html" "$workingDir/index.html"
fi


if [ -n "${TOTP_PROXY_UPSTREAM:-}" ]; then
  sed -i "s|TOTP_PROXY_PLACEHOLDER|${TOTP_PROXY_UPSTREAM}|g" /etc/nginx/nginx.conf
else
  sed -i '/location \/local\/totp\//,/^[[:space:]]*}/d' /etc/nginx/nginx.conf || true
fi

exec "$@"

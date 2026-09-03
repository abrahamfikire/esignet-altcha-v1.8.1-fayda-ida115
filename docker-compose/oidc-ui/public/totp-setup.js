(function () {
  "use strict";

  var API =
    (window._env_ && window._env_.TOTP_API_BASE) || "/local/totp";
  var CACHE = null;
  var uiReady = false;
  var lastDigitAt = 0;
  var fetchPatched = false;
  var modalOpen = false;
  var forceErrorUntil = 0;
  var lastShownKind = "";
  var spinnerWatchTimer = null;

  var MSGS = {
    en: {
      firstTimeQ: "Is this your first time registering?",
      registerTotp: "Register TOTP",
      title: "Register authenticator app",
      modalIntro: "Enter your FAN or FCN to generate a QR code for your authenticator app.",
      fanLabel: "FAN or FCN",
      fanPlaceholder: "Enter Your FAN (Fayda Alias Number) or FCN",
      generateQr: "Generate QR code",
      needFanFirst: "Please enter your FAN or FCN first.",
      qrIntro: "Scan the QR code with your authenticator app, then enter the 6-digit code to activate.",
      loading: "Generating QR code…",
      confirmLabel: "Enter the 6-digit code from your authenticator app",
      confirmBtn: "Activate",
      close: "Close",
      success:
        "Registration complete. Close this window, enter your FAN and code, then tap Verify.",
      enrollErr: "Could not generate QR code. Check your connection and try again.",
      confirmErr: "Activation failed. Enter the latest code from your authenticator app.",
      manual: "Or enter this key manually in your authenticator app",
      scanHint: "Authenticator app → Add account → Scan QR code",
      expired:
        "Your code has expired. Codes change every 30 seconds — enter the latest code from your authenticator app.",
      invalid:
        "Incorrect code. Check the 6-digit code in your authenticator app and try again.",
      notEnrolled:
        "Fayda TOTP is not set up for this FAN. Register TOTP to continue.",
      ok: "OK",
    },
    am: {
      firstTimeQ: "ለመጀመሪያ ጊዜ ነው?",
      registerTotp: "TOTP ይመዝገቡ",
      title: "Authenticator app ይመዝገቡ",
      modalIntro: "FAN ወይም FCN ያስገቡ እና QR ኮድ ይፍጠሩ።",
      fanLabel: "FAN ወይም FCN",
      fanPlaceholder: "FAN (Fayda Alias Number) ወይም FCN",
      generateQr: "QR ኮድ ይፍጠሩ",
      needFanFirst: "መጀመሪያ FAN ወይም FCN ያስገቡ።",
      qrIntro: "QR ኮዱን በauthenticator app ይቃኙ፣ ከዚያ የ6-አሃዝ ኮድ ያስገቡ።",
      loading: "QR ኮድ በመፍጠር ላይ…",
      confirmLabel: "ከauthenticator app የ6-አሃዝ ኮድ ያስገቡ",
      confirmBtn: "ያግብሩ",
      close: "ዝጋ",
      success: "ምዝገባ ተጠናቋል። FAN እና ኮድዎን ያስገቡ፣ Verify ይጫኑ።",
      enrollErr: "QR ኮድ መፍጠር አልተሳካም። እንደገና ይሞክሩ።",
      confirmErr: "ማግበር አልተሳካም። የአሁኑን ኮድ ያስገቡ።",
      manual: "ወይም ቁልፉን በauthenticator app በእጅ ያስገቡ",
      scanHint: "Authenticator app → Add account → Scan QR code",
      expired: "ኮድዎ ጊዜው አልፏል። የአሁኑን ኮድ ያስገቡ።",
      invalid: "የተሳሳተ ኮድ። authenticator app ያረጋግጡ።",
      notEnrolled: "ለዚህ FAN TOTP አልተሰናዳም። «TOTP ይመዝገቡ» ይጫኑ።",
      ok: "እሺ",
    },
  };

  function lang() {
    var l = (document.documentElement.lang || "en").slice(0, 2);
    return MSGS[l] || MSGS.en;
  }

  function t(key) {
    return lang()[key] || MSGS.en[key] || key;
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function mainFanInputs() {
    return document.querySelectorAll(
      'input[id^="Totp_"], input[name^="Totp_"], input[id*="vid" i], input[name*="vid" i], input[placeholder*="FAN" i], input[placeholder*="FCN" i]'
    );
  }

  function fanFromPage() {
    var inputs = mainFanInputs();
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].id === "totp-modal-fan") continue;
      var v = (inputs[i].value || "").trim();
      if (v) return v;
    }
    return "";
  }

  function getModalFan() {
    var el = $("#totp-modal-fan");
    return el && el.value.trim ? el.value.trim() : "";
  }

  function syncFanToMain(fan) {
    if (!fan) return;
    mainFanInputs().forEach(function (inp) {
      if (inp.id === "totp-modal-fan") return;
      if (inp.value !== fan) {
        inp.value = fan;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  function setModalMsg(text, kind) {
    var el = $("#totp-modal-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "totp-modal-msg" + (kind ? " totp-modal-msg-" + kind : "");
  }

  function resetModalSteps() {
    CACHE = null;
    var fanStep = $("#totp-modal-fan-step");
    var qrArea = $("#totp-modal-qr-area");
    var intro = $("#totp-modal-intro");
    if (fanStep) fanStep.hidden = false;
    if (qrArea) qrArea.hidden = true;
    if (intro) intro.textContent = t("modalIntro");
    var code = $("#totp-modal-confirm-code");
    if (code) code.value = "";
    var fan = $("#totp-modal-fan");
    if (fan) fan.value = fanFromPage();
    setModalMsg("", "");
  }

  function post(path, body) {
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: body }),
    }).then(function (r) {
      return r.text().then(function (text) {
        var json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          json = null;
        }
        return { ok: r.ok, status: r.status, json: json, raw: text };
      });
    });
  }

  function openRegisterModal() {
    var overlay = $("#totp-modal-overlay");
    if (!overlay) return;
    modalOpen = true;
    overlay.hidden = false;
    document.body.classList.add("totp-modal-open");
    resetModalSteps();
    var fan = $("#totp-modal-fan");
    if (fan) fan.focus();
  }

  function closeModal() {
    var overlay = $("#totp-modal-overlay");
    if (!overlay) return;
    modalOpen = false;
    overlay.hidden = true;
    document.body.classList.remove("totp-modal-open");
  }

  function generateQr() {
    var fan = getModalFan();
    if (!fan) {
      setModalMsg(t("needFanFirst"), "error");
      var el = $("#totp-modal-fan");
      if (el) el.focus();
      return;
    }
    syncFanToMain(fan);
    setModalMsg(t("loading"), "");
    post("/enroll", { individualId: fan }).then(function (res) {
      var r = res.json && res.json.response;
      if (!res.ok || !r || !r.qrCodeUrl) {
        var err =
          (res.json &&
            res.json.errors &&
            res.json.errors[0] &&
            res.json.errors[0].message) ||
          t("enrollErr");
        setModalMsg(err, "error");
        return;
      }
      CACHE = r;
      var img = $("#totp-modal-qr");
      img.src = r.qrCodeUrl;
      img.alt = "TOTP QR code";
      $("#totp-modal-secret").textContent = r.manualEntryKey || "";
      $("#totp-modal-fan-step").hidden = true;
      $("#totp-modal-intro").textContent = t("qrIntro");
      $("#totp-modal-qr-area").hidden = false;
      setModalMsg(t("scanHint"), "ok");
    }).catch(function () {
      setModalMsg(t("enrollErr"), "error");
    });
  }

  function confirmEnroll() {
    if (!CACHE) return;
    var code = ($("#totp-modal-confirm-code").value || "").trim();
    if (code.length !== 6) {
      setModalMsg(t("confirmErr"), "error");
      return;
    }
    setModalMsg(t("loading"), "");
    post("/confirm", {
      individualId: CACHE.individualId || getModalFan() || fanFromPage(),
      sessionId: CACHE.sessionId || "",
      code: code,
    }).then(function (res) {
      if (!res.ok || !res.json || !res.json.response || res.json.response.status !== "success") {
        setModalMsg(t("confirmErr"), "error");
        return;
      }
      setModalMsg(t("success"), "ok");
      setTimeout(closeModal, 2200);
    }).catch(function () {
      setModalMsg(t("confirmErr"), "error");
    });
  }

  function ensureStyles() {
    if (document.getElementById("vf-totp-setup-css")) return;
    var style = document.createElement("style");
    style.id = "vf-totp-setup-css";
    style.textContent = [
      "body.vf-totp-auth-error .loading-indicator{display:none!important}",
      "/* keep React error banner visible once text is corrected */",
      "#vf-totp-reg-host{position:fixed;z-index:40;text-align:center;pointer-events:none}",
      "#vf-totp-reg-host .totp-setup-reg-wrap{pointer-events:auto}",
      "#vf-totp-error-modal{display:none!important}",
      "#vf-totp-reg-host .totp-register-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;line-height:1!important;height:2.35rem!important;padding:0 1.35rem!important;margin:0 auto!important;text-align:center!important;vertical-align:middle!important}",
      "#vf-totp-reg-host .totp-first-time-q{margin:0 0 0.7rem!important;text-align:center!important}",
      "#vf-totp-reg-host .totp-setup-reg-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center}",
    ].join("");
    document.head.appendChild(style);
  }

  function buildModalUi() {
    if (uiReady) return;
    if (!document.getElementById("totp_verify_input")) return;
    uiReady = true;
    ensureStyles();

    var host = document.getElementById("vf-totp-reg-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vf-totp-reg-host";
      document.body.appendChild(host);
    }
    host.innerHTML = "";
    var regWrap = document.createElement("div");
    regWrap.id = "totp-setup-reg-wrap";
    regWrap.className = "totp-setup-reg-wrap";
    regWrap.innerHTML =
      '<p class="totp-first-time-q">' +
      t("firstTimeQ") +
      '</p><button type="button" id="totp-register-btn" class="totp-register-btn">' +
      t("registerTotp") +
      "</button>";
    host.appendChild(regWrap);
    $("#totp-register-btn").addEventListener("click", openRegisterModal);
    positionRegHost();

    if (!document.getElementById("totp-modal-overlay")) {
      var overlay = document.createElement("div");
      overlay.id = "totp-modal-overlay";
      overlay.className = "totp-modal-overlay";
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="totp-modal-backdrop" data-close="1"></div>' +
        '<div class="totp-modal-card" role="dialog" aria-modal="true" aria-labelledby="totp-modal-title">' +
        '<button type="button" class="totp-modal-close" data-close="1" aria-label="' +
        t("close") +
        '">&times;</button>' +
        '<h2 id="totp-modal-title" class="totp-modal-title">' +
        t("title") +
        "</h2>" +
        '<p id="totp-modal-intro" class="totp-modal-intro">' +
        t("modalIntro") +
        "</p>" +
        '<div id="totp-modal-fan-step" class="totp-modal-fan-step">' +
        '<label class="totp-modal-label">' +
        t("fanLabel") +
        '<input type="text" id="totp-modal-fan" class="totp-modal-fan" autocomplete="off" placeholder="' +
        t("fanPlaceholder") +
        '" /></label>' +
        '<button type="button" id="totp-modal-generate" class="totp-modal-btn-primary">' +
        t("generateQr") +
        "</button>" +
        "</div>" +
        '<div id="totp-modal-qr-area" class="totp-modal-qr-area" hidden>' +
        '<img id="totp-modal-qr" class="totp-modal-qr" alt="" />' +
        '<p class="totp-modal-manual"><span>' +
        t("manual") +
        ':</span> <code id="totp-modal-secret"></code></p>' +
        '<label class="totp-modal-label">' +
        t("confirmLabel") +
        '<input type="text" id="totp-modal-confirm-code" class="totp-modal-code" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="000000" autocomplete="one-time-code" /></label>' +
        '<button type="button" id="totp-modal-confirm" class="totp-modal-btn-primary">' +
        t("confirmBtn") +
        "</button>" +
        "</div>" +
        '<p id="totp-modal-msg" class="totp-modal-msg" role="status"></p>' +
        "</div>";
      document.body.appendChild(overlay);
      overlay.querySelectorAll("[data-close]").forEach(function (el) {
        el.addEventListener("click", closeModal);
      });
      $("#totp-modal-generate").addEventListener("click", generateQr);
      $("#totp-modal-confirm").addEventListener("click", confirmEnroll);
      var modalFan = $("#totp-modal-fan");
      if (modalFan) {
        modalFan.addEventListener("keydown", function (e) {
          if (e.key === "Enter") generateQr();
        });
      }
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          if (modalOpen) closeModal();
          else closeErrorModal();
        }
      });
    }
  }

  function positionRegHost() {
    var host = document.getElementById("vf-totp-reg-host");
    var verify = document.getElementById("verify_totp");
    var pin = document.getElementById("totp_verify_input");
    if (!host || !verify || !pin) {
      if (host) host.style.display = "none";
      return;
    }
    host.style.display = "";
    var form = pin.closest("form") || pin.parentElement;
    var box = (form || pin).getBoundingClientRect();
    var pr = pin.getBoundingClientRect();
    var vr = verify.getBoundingClientRect();
    var verifyWrap = verify.parentElement;
    if (verifyWrap) verifyWrap.style.marginTop = "5.25rem";

    var hostHeight = Math.max(host.offsetHeight || 0, 68);
    var top = pr.bottom + 14;
    if (top + hostHeight > vr.top - 8) {
      top = Math.max(pr.bottom + 8, vr.top - hostHeight - 10);
    }

    host.style.left = box.left + box.width / 2 + "px";
    host.style.top = top + "px";
    host.style.transform = "translateX(-50%)";
    host.style.width = Math.max(200, box.width - 48) + "px";
    host.style.textAlign = "center";
  }


  function errorMessageFor(kind) {
    if (kind === "expired") return t("expired");
    if (kind === "not_enrolled") return t("notEnrolled");
    return t("invalid");
  }

  function applyBannerMessage() {
    var el = document.getElementById("error-banner-message");
    if (!el || !lastShownKind) return false;
    el.textContent = errorMessageFor(lastShownKind);
    return true;
  }

  function patchErrorBanner() {
    applyBannerMessage();
  }

  function watchTotpInputs(root) {
    var box = (root || document).querySelector("#totp_verify_input");
    if (!box) return;
    box.querySelectorAll("input").forEach(function (inp) {
      if (inp.dataset.totpWatch) return;
      inp.dataset.totpWatch = "1";
      inp.addEventListener("input", function () {
        lastDigitAt = Date.now();
      });
    });
  }

  function hideAuthenticatingSpinner() {
    document.body.classList.add("vf-totp-auth-error");
  }

  function closeErrorModal() {
    var modal = document.getElementById("vf-totp-error-modal");
    if (modal) {
      modal.hidden = true;
      modal.style.display = "none";
    }
  }

  function showLoginError(kind) {
    lastShownKind = kind || "invalid";
    forceErrorUntil = Date.now() + 60000;
    ensureStyles();
    hideAuthenticatingSpinner();
    closeErrorModal();
    applyBannerMessage();
    var tries = 0;
    var timer = setInterval(function () {
      applyBannerMessage();
      if (++tries > 25) clearInterval(timer);
    }, 40);
  }

  function mapAuthErrorCode(code, extra) {
    var blob = (String(code || "") + " " + String(extra || "")).toLowerCase();
    if (/not[_ ]?enroll|totp_not_enrolled/.test(blob)) return "not_enrolled";
    if (/totp_expired|expired/.test(blob)) return "expired";
    if (lastDigitAt && Date.now() - lastDigitAt > 35000) return "expired";
    return "invalid";
  }

  function handleAuthBody(bodyJson, status) {
    var errs = bodyJson && bodyJson.errors;
    if (errs && errs.length) {
      var e0 = errs[0] || {};
      var code = e0.errorCode || e0.error || e0.message || "";
      var extra = e0.errorMessage || e0.message || "";
      showLoginError(mapAuthErrorCode(code, extra));
      return true;
    }
    if (status >= 400 || (bodyJson && bodyJson.response == null && status)) {
      showLoginError(mapAuthErrorCode("auth_failed"));
      return true;
    }
    return false;
  }

  function patchXhrAuthenticate() {
    if (window.__vfTotpXhrPatched) return;
    window.__vfTotpXhrPatched = true;
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__vfUrl = url || "";
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var xhr = this;
      var url = String(xhr.__vfUrl || "");
      var isAuth = url.indexOf("authenticate") >= 0;
      if (!isAuth) {
        return send.apply(this, arguments);
      }

      function finish() {
        if (!document.getElementById("totp_verify_input")) return;
        try {
          var status = xhr.status;
          var text = xhr.responseText || "";
          var bodyJson = null;
          try {
            bodyJson = text ? JSON.parse(text) : null;
          } catch (e) {
            bodyJson = null;
          }
          if (!handleAuthBody(bodyJson, status)) {
            forceErrorUntil = 0;
            document.body.classList.remove("vf-totp-auth-error");
          }
        } catch (e) {
          showLoginError("invalid");
        }
      }

      xhr.addEventListener("loadend", finish);
      xhr.addEventListener("error", function () {
        if (document.getElementById("totp_verify_input")) showLoginError("invalid");
      });

      return send.apply(this, arguments);
    };
  }

  function patchFetch() {
    if (fetchPatched || !window.fetch) return;
    fetchPatched = true;
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var isAuth = url.indexOf("authenticate") >= 0;
      if (!isAuth) return orig(input, init);

      return orig(input, init)
        .then(function (res) {
          if (!document.getElementById("totp_verify_input")) return res;
          return res
            .clone()
            .json()
            .then(function (body) {
              handleAuthBody(body, res.status);
              return res;
            })
            .catch(function () {
              return res;
            });
        })
        .catch(function (err) {
          if (document.getElementById("totp_verify_input")) showLoginError("invalid");
          throw err;
        });
    };
  }

  function keepErrorVisible() {
    var modal = document.getElementById("vf-totp-error-modal");
    if (modal && !modal.hidden) {
      document.body.classList.add("vf-totp-auth-error");
    }
  }

  var tickScheduled = false;
  function tick() {
    ensureStyles();
    patchXhrAuthenticate();
    patchFetch();
    watchTotpInputs();
    var onTotp = !!document.getElementById("totp_verify_input");
    var host = document.getElementById("vf-totp-reg-host");
    if (!onTotp) {
      if (host) host.style.display = "none";
      if (uiReady && !document.getElementById("totp-setup-reg-wrap")) {
        uiReady = false;
      }
    } else {
      buildModalUi();
      positionRegHost();
    }
    patchErrorBanner();
    keepErrorVisible();
  }

  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    setTimeout(function () {
      tickScheduled = false;
      tick();
    }, 0);
  }

  document.addEventListener("DOMContentLoaded", tick);
  window.addEventListener("resize", function () {
    if (document.getElementById("totp_verify_input")) positionRegHost();
  });
  window.addEventListener("scroll", function () {
    if (document.getElementById("totp_verify_input")) positionRegHost();
  }, true);
  new MutationObserver(scheduleTick).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(tick, 0);
  setTimeout(tick, 500);
  setTimeout(tick, 1500);
})();

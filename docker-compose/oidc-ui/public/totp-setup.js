(function () {
  "use strict";

  var API =
    (window._env_ && window._env_.TOTP_API_BASE) || "/local/totp";
  var CACHE = null;
  var uiReady = false;
  var lastDigitAt = 0;
  var fetchPatched = false;
  var modalOpen = false;

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

  function buildModalUi() {
    if (uiReady) return;
    if (!document.getElementById("totp_verify_input")) return;
    uiReady = true;

    var regWrap = document.createElement("div");
    regWrap.id = "totp-setup-reg-wrap";
    regWrap.className = "totp-setup-reg-wrap";
    regWrap.innerHTML =
      '<p class="totp-first-time-q">' +
      t("firstTimeQ") +
      '</p><button type="button" id="totp-register-btn" class="totp-register-btn">' +
      t("registerTotp") +
      "</button>";

    var verifyBtn = document.getElementById("verify_totp");
    if (verifyBtn && verifyBtn.parentElement && verifyBtn.parentElement.parentElement) {
      verifyBtn.parentElement.parentElement.insertBefore(
        regWrap,
        verifyBtn.parentElement
      );
    } else {
      var form = document.getElementById("totp_verify_input").closest("form");
      if (form) form.appendChild(regWrap);
    }

    $("#totp-register-btn").addEventListener("click", openRegisterModal);

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
      if (e.key === "Escape" && modalOpen) closeModal();
    });
  }

  function patchErrorBanner() {
    var el = $("#error-banner-message");
    if (!el || !document.getElementById("totp_verify_input")) return;
    var txt = (el.textContent || "").trim();
    if (!txt) return;
    if (/totp_expired|expired|ጊዜው አልፏል/i.test(txt)) {
      el.textContent = t("expired");
      return;
    }
    if (/totp_invalid|totp_not_enrolled/i.test(txt)) {
      el.textContent = t("invalid");
      return;
    }
    var age = lastDigitAt ? Date.now() - lastDigitAt : 0;
    if (age > 35000) {
      el.textContent = t("expired");
      return;
    }
    if (/VeriFayda|Incorrect|invalid|not valid|auth_failed|ተሳሳተ|TOTP|totp/i.test(txt)) {
      el.textContent = t("invalid");
    }
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

  function patchFetch() {
    if (fetchPatched || !window.fetch) return;
    fetchPatched = true;
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      return orig(input, init).then(function (res) {
        if (!document.getElementById("totp_verify_input")) return res;
        if (url.indexOf("authenticate") < 0) return res;
        return res.clone().json().then(function (body) {
          var errs = body && body.errors;
          if (errs && errs.length && errs[0].errorCode) {
            setTimeout(function () {
              var el = $("#error-banner-message");
              if (!el) return;
              var code = errs[0].errorCode;
              if (code === "totp_expired") el.textContent = t("expired");
              else if (code === "totp_invalid") el.textContent = t("invalid");
              else if (code === "totp_not_enrolled") el.textContent = t("invalid");
              else if (code === "auth_failed") patchErrorBanner();
            }, 50);
          }
          return res;
        }).catch(function () {
          return res;
        });
      });
    };
  }

  function tick() {
    patchFetch();
    watchTotpInputs();
    buildModalUi();
    patchErrorBanner();
  }

  document.addEventListener("DOMContentLoaded", tick);
  new MutationObserver(tick).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();

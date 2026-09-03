(function () {
  "use strict";

  var CACHE = "20260903e";
  var B = "/logo.png?v=" + CACHE;
  var F = "/images/footer_logo.png?v=" + CACHE;
  var C = "/images/demo-client-logo.png?v=" + CACHE;
  var I = {
    otp: "/images/otp_icon.svg?v=" + CACHE,
    bio: "/images/bio_icon.svg?v=" + CACHE,
    totp: "/images/totp_icon.png?v=" + CACHE,
  };
  var OAUTH_B64_KEY = "verifayda_oauth_b64";

  function loginPath() {
    return (window.location.pathname || "").indexOf("/login") >= 0;
  }

  function hashPayload() {
    var raw = window.location.hash || "";
    return raw.charAt(0) === "#" ? raw.slice(1) : raw;
  }

  /** CSRF token is per-host (localhost vs 127.0.0.1). */
  (function fixCsrfHost() {
    var host = window.location.host;
    if (sessionStorage.getItem("csrfHost") !== host) {
      sessionStorage.removeItem("csrfToken");
      sessionStorage.setItem("csrfHost", host);
    }
  })();

  /** Restore #oauth hash when missing (refresh/bookmark). Never redirect if hash exists. */
  (function bootLoginHash() {
    if (!loginPath()) return;
    var search = window.location.search || "";
    var payload = hashPayload();
    if (payload.length > 32) {
      sessionStorage.setItem(OAUTH_B64_KEY, payload);
      return;
    }
    var saved = sessionStorage.getItem(OAUTH_B64_KEY);
    if (saved && saved.length > 32) {
      window.location.replace("/login" + search + "#" + saved);
    }
  })();

  function fixLoginIcons(root) {
    (root || document)
      .querySelectorAll('button[id^="login_with_"] img')
      .forEach(function (el) {
        if (el.getAttribute("data-vf-icon") === "1") return;
        el.setAttribute("data-vf-icon", "1");
        el.style.background = "transparent";
        el.style.borderRadius = "0";
        el.style.padding = "0";
        el.style.objectFit = "contain";
        el.style.boxSizing = "border-box";
        el.style.flexShrink = "0";
        var id = (el.closest("button") || {}).id || "";
        if (id.indexOf("totp") >= 0) {
          el.style.width = "2rem";
          el.style.height = "2rem";
          if (el.src.indexOf(I.totp) < 0) el.src = I.totp;
        } else if (id.indexOf("otp") >= 0 || id.indexOf("pin") >= 0) {
          el.style.width = "2.25rem";
          el.style.height = "1.6rem";
          if (el.src.indexOf(I.otp) < 0) el.src = I.otp;
        } else {
          el.style.width = "2rem";
          el.style.height = "2rem";
          if (id.indexOf("bio") >= 0 && el.src.indexOf(I.bio) < 0) {
            el.src = I.bio;
          }
        }
      });
  }

  function fixLoginOrder(root) {
    var c = (root || document).querySelector(".flex.flex-col.gap-5");
    if (!c || c.getAttribute("data-vf-order") === "1") return;
    var order = ["login_with_otp", "login_with_bio", "login_with_totp"];
    var nodes = order
      .map(function (id) {
        var b = c.querySelector('[id="' + id + '"]');
        return b && b.closest(".min-h-fit") ? b.closest(".min-h-fit") : null;
      })
      .filter(Boolean);
    if (nodes.length < 2) return;
    nodes.forEach(function (n) {
      c.appendChild(n);
    });
    c.setAttribute("data-vf-order", "1");
  }

  function fixPartnerLogos(root) {
    (root || document)
      .querySelectorAll("img.client-logo-size,img.brand-only-logo,img.brand-logo")
      .forEach(function (el) {
        if (el.getAttribute("data-vf-logo") === "1") return;
        el.setAttribute("data-vf-logo", "1");
        el.style.background = "transparent";
        el.style.borderRadius = "0";
        el.style.padding = "0";
        el.style.boxShadow = "none";
      });
  }

  var OTP_HEADING_EN = "Enter your Fayda Number (FAN or FCN)";

  function fixOtpHeading() {
    if (document.querySelector('[id="verify_totp"]')) return;
    if (document.querySelector('[id="totp_verify_input"]')) return;
    var send = document.querySelector('[id="get_otp"]');
    if (!send) return;
    var card = send.closest(".text-white");
    if (!card || card.querySelector(".verifayda-otp-heading")) return;
    var inp = card.querySelector(
      'input[id^="Otp_"], input[placeholder*="FAN" i], input[placeholder*="FCN" i]'
    );
    if (!inp) return;
    var row = inp.closest(".flex.items-center") || inp.closest(".flex") || inp.parentElement;
    var h = document.createElement("h2");
    h.className = "verifayda-otp-heading";
    h.textContent = OTP_HEADING_EN;
    if (row && row.parentElement) {
      row.parentElement.insertBefore(h, row);
    } else if (card) {
      card.insertBefore(h, card.firstChild);
    }
    var lang = (document.documentElement.lang || "en").replace(/-.*/, "");
    fetch("/locales/" + lang + ".json")
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (j) {
        if (j && j.otp && j.otp.vid_label_text) {
          h.textContent = j.otp.vid_label_text;
        }
      })
      .catch(function () {});
  }

  function fixBrandImages(root) {
    (root || document)
      .querySelectorAll("img.brand-logo,img.brand-only-logo")
      .forEach(function (el) {
        if (el.getAttribute("data-vf-brand") === "1") return;
        el.setAttribute("data-vf-brand", "1");
        el.removeAttribute("content");
        if (!el.getAttribute("src") || el.src.indexOf("logo.png") < 0) {
          el.src = B;
        }
      });
    (root || document).querySelectorAll("img.footer-brand-logo").forEach(function (el) {
      if (el.getAttribute("data-vf-brand") === "1") return;
      el.setAttribute("data-vf-brand", "1");
      el.removeAttribute("content");
      if (!el.getAttribute("src") || el.src.indexOf("footer_logo") < 0) {
        el.src = F;
      }
    });
  }

  function applyUiFixes() {
    fixBrandImages(document);
    fixPartnerLogos(document);
    fixLoginIcons(document);
    fixLoginOrder(document);
    fixOtpHeading();
  }

  var scheduled = false;
  function scheduleUiFixes() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      applyUiFixes();
    });
  }

  applyUiFixes();
  document.addEventListener("DOMContentLoaded", applyUiFixes);
  setTimeout(applyUiFixes, 1500);

  new MutationObserver(function (mutations) {
    var relevant = false;
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        if (n.nodeType !== 1) continue;
        if (
          (n.id && n.id.indexOf("login_with_") === 0) ||
          (n.querySelector && n.querySelector('[id^="login_with_"], [id="get_otp"]'))
        ) {
          relevant = true;
          break;
        }
      }
      if (relevant) break;
    }
    if (relevant) scheduleUiFixes();
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener(
    "error",
    function (e) {
      var t = e.target;
      if (!t || t.tagName !== "IMG" || !t.classList.contains("client-logo-size")) {
        return;
      }
      if (t.src && t.src.indexOf("demo-client-logo") >= 0) return;
      t.onerror = null;
      t.src = C;
    },
    true
  );
})();

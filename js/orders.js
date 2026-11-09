/* ──────────────────────────────────────────────────────────────
   Order API: talks to the `dev-order` Supabase edge function.

     OrderApi.sendOtp(email, name)    → { ok, expires_in, resend_after }
     OrderApi.submitOrder(order, code) → { ok, order_code, email_sent }

   Failures throw OrderApi.Error with a `code` such as:
     invalid_email, too_soon (data.retry_after), too_many_codes, mail_failed,
     code_invalid (data.attempts_left), code_expired, code_locked,
     too_many_orders, invalid_order (data.fields), server_error, network

   Browser / device details are collected here and sent with the order;
   the function adds the IP address and request headers on its side.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = 'https://gxvcgubbqtccoycvdupq.supabase.co/functions/v1/dev-order';
  const pageLoadedAt = Date.now();

  class OrderApiError extends Error {
    constructor(code, data) {
      super(code);
      this.code = code;
      this.data = data || {};
    }
  }

  async function call(payload) {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      throw new OrderApiError('network');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
    if (!res.ok || !data.ok) throw new OrderApiError(data.error || `http_${res.status}`, data);
    return data;
  }

  const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };

  async function collectClientInfo() {
    const n = navigator;
    const s = window.screen;
    const info = {
      userAgent: n.userAgent,
      platform: n.platform,
      vendor: n.vendor,
      language: n.language,
      languages: n.languages ? Array.from(n.languages) : undefined,
      timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      timezoneOffsetMin: new Date().getTimezoneOffset(),
      screen: {
        width: s.width,
        height: s.height,
        availWidth: s.availWidth,
        availHeight: s.availHeight,
        colorDepth: s.colorDepth,
        pixelRatio: window.devicePixelRatio,
        orientation: safe(() => s.orientation.type)
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hardwareConcurrency: n.hardwareConcurrency,
      deviceMemory: n.deviceMemory,
      maxTouchPoints: n.maxTouchPoints,
      cookieEnabled: n.cookieEnabled,
      doNotTrack: n.doNotTrack,
      pdfViewerEnabled: n.pdfViewerEnabled,
      webdriver: n.webdriver,
      prefersColorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      referrer: document.referrer || undefined,
      page: location.href,
      timeOnPageSec: Math.round((Date.now() - pageLoadedAt) / 1000),
      capturedAt: new Date().toISOString()
    };

    const c = n.connection;
    if (c) info.connection = { effectiveType: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData, type: c.type };

    info.gpu = safe(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : undefined;
    });

    const utm = {};
    new URLSearchParams(location.search).forEach((v, k) => { if (k.startsWith('utm_')) utm[k] = v.slice(0, 200); });
    if (Object.keys(utm).length) info.utm = utm;

    if (n.userAgentData) {
      info.uaData = { brands: n.userAgentData.brands, mobile: n.userAgentData.mobile, platform: n.userAgentData.platform };
      try {
        const hi = await n.userAgentData.getHighEntropyValues(['platformVersion', 'model', 'architecture', 'bitness', 'fullVersionList']);
        Object.assign(info.uaData, {
          platformVersion: hi.platformVersion,
          model: hi.model,
          architecture: hi.architecture,
          bitness: hi.bitness,
          fullVersionList: hi.fullVersionList
        });
      } catch (e) { /* not granted */ }
    }
    return info;
  }

  window.OrderApi = {
    Error: OrderApiError,
    sendOtp: (email, name) => call({ action: 'send-otp', email, name }),
    submitOrder: async (order, code) => call({ action: 'submit', code, order, client: await collectClientInfo() })
  };
})();

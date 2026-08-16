/**
 * Refferq Tracking Script
 * Embed this on your website to track referrals and conversions
 * 
 * Usage:
 * <script src="https://your-domain.com/scripts/refferq-tracker.js" data-api-key="your_public_key"></script>
 */

(function() {
  'use strict';

  // Configuration
  const script = document.currentScript;
  const apiKey = script.getAttribute('data-api-key');
  const apiUrl = script.getAttribute('data-api-url') || window.location.origin;
  const cookieDays = parseInt(script.getAttribute('data-cookie-days') || '30', 10) || 30;
  
  if (!apiKey) {
    console.error('[Refferq] API key is required. Add data-api-key attribute to script tag.');
    return;
  }

  // Cookie utilities
  const Cookies = {
    set: function(name, value, days) {
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      const secure = location.protocol === 'https:' ? ';Secure' : '';
      document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax' + secure;
    },
    get: function(name) {
      const nameEQ = name + '=';
      const ca = document.cookie.split(';');
      for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
          try {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
          } catch (_e) {
            return c.substring(nameEQ.length, c.length);
          }
        }
      }
      return null;
    },
    delete: function(name) {
      this.set(name, '', -1);
    }
  };

  // Get referral code from URL parameter
  function getReferralCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('ref') || urlParams.get('referral') || urlParams.get('affiliate');
  }

  // Track referral click
  function trackReferral(referralCode) {
    fetch(apiUrl + '/api/track/referral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        referralCode: referralCode,
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('[Refferq] Referral tracked successfully');
      } else {
        console.error('[Refferq] Failed to track referral:', data.error);
      }
    })
    .catch(error => {
      console.error('[Refferq] Error tracking referral:', error);
    });
  }

  // Track conversion
  function trackConversion(options) {
    const referralCode = Cookies.get('refferq_ref');
    
    if (!referralCode) {
      console.warn('[Refferq] No referral code found in cookies');
      return Promise.resolve({ success: false, error: 'No referral code' });
    }

    let attributionKey = options.attributionKey || null;
    try {
      const raw = Cookies.get('affiliate_attribution');
      if (raw) {
        const parsed = JSON.parse(decodeURIComponent(raw));
        attributionKey = attributionKey || parsed.attribution_key || null;
      }
    } catch (_e) {}

    return fetch(apiUrl + '/api/track/conversion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        referralCode: referralCode,
        customerEmail: options.email,
        customerName: options.name,
        amount: options.amount || 0,
        currency: options.currency || 'USD',
        orderId: options.orderId,
        attributionKey: attributionKey,
        metadata: options.metadata || {},
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('[Refferq] Conversion tracked successfully');
        // Clear referral cookie after conversion
        Cookies.delete('refferq_ref');
      } else {
        console.error('[Refferq] Failed to track conversion:', data.error);
      }
      return data;
    })
    .catch(error => {
      console.error('[Refferq] Error tracking conversion:', error);
      return { success: false, error: error.message };
    });
  }

  function stampCheckoutForms(referralCode) {
    if (!referralCode) return;
    document.querySelectorAll('form').forEach(function(form) {
      const action = (form.getAttribute('action') || '').toLowerCase();
      if (action.indexOf('/klub/payment') === -1 && action.indexOf('/klub/subscribe') === -1) {
        return;
      }
      let input = form.querySelector('input[name="referral_code"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'referral_code';
        form.appendChild(input);
      }
      input.value = referralCode;
    });
  }

  // Initialize tracking
  function init() {
    // Check for referral code in URL
    const refCode = getReferralCodeFromURL();

    if (refCode && /^[A-Za-z0-9\-]{3,32}$/.test(refCode)) {
      // Set the cookie immediately. Checkout metadata depends on it; do not wait
      // for the click API (that call is analytics, and a slow/failed fetch used
      // to leave the buyer with no cookie if they checked out right away).
      Cookies.set('refferq_ref', refCode, cookieDays);
      stampCheckoutForms(refCode);
      trackReferral(refCode);
    } else {
      stampCheckoutForms(Cookies.get('refferq_ref'));
    }

    document.addEventListener('submit', function(event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      stampCheckoutForms(Cookies.get('refferq_ref'));
    }, true);
  }

  // Public API
  window.Refferq = {
    trackConversion: trackConversion,
    getReferralCode: function() {
      return Cookies.get('refferq_ref');
    },
    clearReferralCode: function() {
      Cookies.delete('refferq_ref');
    },
    version: '1.0.0'
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

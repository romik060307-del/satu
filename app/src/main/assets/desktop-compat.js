/* WA Cloning RK v2.0 - make navigator agree with the desktop user-agent the app already sends.
 * The user-agent string says "Windows / Chrome", but WebView still reports navigator.platform = "Linux ..." and
 * navigator.userAgentData = { mobile: true, platform: "Android" }. A feature check that reads either of those
 * (for example "can this browser place WhatsApp calls?") sees a phone and can switch the feature off.
 * This only aligns those two values with the user-agent string. It is applied only while the
 * "mode kompatibilitas desktop" setting is on (the default).
 */
(function () {
  'use strict';
  try {
    var W = window;
    var N = W.navigator;
    if (W.__rkCompatApplied) return 'already';
    W.__rkCompatApplied = true;

    var chrome = /Chrome\/(\d+)(?:\.(\d+)\.(\d+)\.(\d+))?/.exec(N.userAgent || '');
    var major = chrome ? chrome[1] : '120';
    var full = chrome && chrome[2] !== undefined ? chrome[1] + '.' + chrome[2] + '.' + chrome[3] + '.' + chrome[4] : major + '.0.0.0';
    var brands = [
      { brand: 'Chromium', version: major },
      { brand: 'Google Chrome', version: major },
      { brand: 'Not_A Brand', version: '24' }
    ];
    var fullList = [
      { brand: 'Chromium', version: full },
      { brand: 'Google Chrome', version: full },
      { brand: 'Not_A Brand', version: '24.0.0.0' }
    ];

    function define(target, prop, getter) {
      try { Object.defineProperty(target, prop, { get: getter, configurable: true, enumerable: true }); } catch (ignore) { }
    }

    var proto = Object.getPrototypeOf(N) || N;
    define(proto, 'platform', function () { return 'Win32'; });

    if (N.userAgentData) {
      var data = {
        brands: brands,
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: function (hints) {
          var all = {
            brands: brands, mobile: false, platform: 'Windows', platformVersion: '10.0.0',
            architecture: 'x86', bitness: '64', model: '', wow64: false,
            uaFullVersion: full, fullVersionList: fullList
          };
          var out = {};
          var list = hints && hints.length ? hints : [];
          for (var i = 0; i < list.length; i++) if (Object.prototype.hasOwnProperty.call(all, list[i])) out[list[i]] = all[list[i]];
          out.brands = brands; out.mobile = false; out.platform = 'Windows';
          return Promise.resolve(out);
        },
        toJSON: function () { return { brands: brands, mobile: false, platform: 'Windows' }; }
      };
      define(proto, 'userAgentData', function () { return data; });
    }
    return 'ok';
  } catch (e) {
    return 'ignored';
  }
})();

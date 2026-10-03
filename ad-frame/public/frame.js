// Loads one Adsterra banner. GameAtlas embeds this page as /frame?unit=468x60
// from a sandboxed iframe on a different origin, so the ad code can't reach
// GameAtlas pages, and shows it only after this script reports an ad rendered.
// The unit keys and script addresses come from units.js, which scripts/build.mjs
// writes from data/site.json (ads.adsterra.units); nothing is taken from the URL.
(function () {
  var name = new URLSearchParams(location.search).get('unit') || '';
  var units = window.GA_UNITS || {};
  var unit = Object.prototype.hasOwnProperty.call(units, name) ? units[name] : null;
  var size = /^(\d+)x(\d+)$/.exec(name);
  if (!unit || !size || !/^https:\/\/[a-z0-9.-]+\//i.test(unit.src)) return;
  window.atOptions = { key: unit.key, format: 'iframe', height: +size[2], width: +size[1], params: {} };
  document.write('<script src="' + unit.src.replace(/"/g, '') + '"><\/script>');
  window.addEventListener('load', function () {
    var filled = !!document.body.querySelector('iframe, img, a, div');
    parent.postMessage({ type: 'ga:ad', filled: filled }, '*');
  });
})();

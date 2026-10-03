// Loads one Adsterra banner. GameAtlas embeds this page as
//   /frame?host=<ad host>&key=<unit key>&w=468&h=60
// from a sandboxed iframe on a different origin, so the ad code can't reach
// GameAtlas pages, and shows it only after this script reports an ad rendered.
(function () {
  var p = new URLSearchParams(location.search);
  var host = p.get('host') || '';
  var key = p.get('key') || '';
  var w = parseInt(p.get('w'), 10);
  var h = parseInt(p.get('h'), 10);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?$/i.test(host) || !/^[a-z0-9]{8,64}$/i.test(key) || !(w > 0 && w <= 728) || !(h > 0 && h <= 250)) return;
  window.atOptions = { key: key, format: 'iframe', height: h, width: w, params: {} };
  document.write('<script src="//' + host + '/' + key + '/invoke.js"><\/script>');
  window.addEventListener('load', function () {
    var filled = !!(document.body && document.body.querySelector('iframe, img, a, div'));
    parent.postMessage({ type: 'ga:ad', filled: filled }, '*');
  });
})();

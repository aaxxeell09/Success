// Réseau simulé du harnais : remplace window.fetch AVANT le chargement du widget.
// window.__net.online = false simule une coupure ; window.__net.remote est le
// contenu de stories.json « sur GitHub ». Les appels sont journalisés.
(function () {
  var DATA_URL = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json';
  var init = window.__NET_INIT || {};
  var net = window.__net = {
    online: init.online !== false,
    remote: init.remote || null,
    calls: [],
  };
  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  window.fetch = function (input, options) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    net.calls.push({ url: url, options: options || {} });
    if (!net.online) return Promise.reject(new TypeError('Failed to fetch'));
    if (url.indexOf(DATA_URL) === 0) {
      if (!net.remote) return Promise.resolve(json({ message: 'indisponible' }, 503));
      return Promise.resolve(json(net.remote));
    }
    if (url.indexOf('https://en.wikipedia.org/w/api.php') === 0) {
      var titles = (new URL(url).searchParams.get('titles') || '').split('|').filter(Boolean);
      var pages = {};
      titles.forEach(function (title, i) {
        pages[String(i + 1)] = {
          pageid: i + 1,
          title: title,
          thumbnail: { source: 'https://upload.wikimedia.org/harnais/' + encodeURIComponent(title) + '.png', width: 1, height: 1 },
        };
      });
      return Promise.resolve(json({ query: { pages: pages } }));
    }
    return Promise.reject(new TypeError('Réseau bloqué par le harnais : ' + url));
  };
})();

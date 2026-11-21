/* The library kept on this TV: liked songs, saved albums and playlists, history, searches.
 * Account sync needs a Google sign-in a Tizen web app cannot do (docs/FEATURE_MATRIX.md). */
(function (root) {
  'use strict';
  var BC = root.BC;
  var MAX_HISTORY = 200, MAX_SEARCHES = 12;

  var lib = Object.assign({ liked: [], saved: [], history: [], searches: [] }, BC.store.get('library', {}));
  function save() { BC.store.set('library', lib); BC.emit('library'); }
  /** Keep only what a card or row needs, so storage stays small. */
  function slim(t) {
    return { id: t.id, title: t.title, artists: (t.artists || []).slice(0, 3), album: t.album || null, duration: t.duration || null, thumb: t.thumb || null };
  }

  BC.library = {
    isLiked: function (id) { return lib.liked.some(function (t) { return t.id === id; }); },
    toggleLike: function (t) {
      var i = lib.liked.findIndex(function (x) { return x.id === t.id; });
      if (i >= 0) lib.liked.splice(i, 1); else lib.liked.unshift(slim(t));
      save();
      return i < 0;
    },
    liked: function () { return lib.liked.slice(); },

    isSaved: function (id) { return lib.saved.some(function (c) { return c.target.id === id; }); },
    /** Save an album or playlist card ({title, subtitle, thumb, target}). */
    toggleSaved: function (card) {
      var i = lib.saved.findIndex(function (c) { return c.target.id === card.target.id; });
      if (i >= 0) lib.saved.splice(i, 1);
      else lib.saved.unshift({ title: card.title, subtitle: card.subtitle || '', thumb: card.thumb || null, target: { kind: card.target.kind, id: card.target.id }, round: false });
      save();
      return i < 0;
    },
    saved: function (kind) { return lib.saved.filter(function (c) { return !kind || c.target.kind === kind; }); },

    addHistory: function (t) {
      lib.history = [slim(t)].concat(lib.history.filter(function (x) { return x.id !== t.id; })).slice(0, MAX_HISTORY);
      save();
    },
    history: function () { return lib.history.slice(); },

    addSearch: function (q) {
      q = q.trim();
      if (!q) return;
      lib.searches = [q].concat(lib.searches.filter(function (s) { return s.toLowerCase() !== q.toLowerCase(); })).slice(0, MAX_SEARCHES);
      save();
    },
    searches: function () { return lib.searches.slice(); },
    clearSearches: function () { lib.searches = []; save(); },
    clearAll: function () { lib = { liked: [], saved: [], history: [], searches: lib.searches }; save(); }
  };
})(typeof window !== 'undefined' ? window : global);

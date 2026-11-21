/* YouTube Music pages from raw InnerTube JSON: a port of BitChord PC's ytm.rs parsers.
 * Every parser tolerates missing fields: a node YouTube stops sending becomes an empty
 * value, never a thrown error (test/yt.test.js runs them on real captures). */
(function (root) {
  'use strict';
  var BC = root.BC;

  // ---- Small readers (ytm.rs bottom) ------------------------------------------------------
  function arr(v) { return Array.isArray(v) ? v : []; }
  function g(v) { // safe path get: g(obj, 'a', 'b', 0, 'c')
    for (var i = 1; i < arguments.length; i++) {
      if (v === null || v === undefined) return undefined;
      v = v[arguments[i]];
    }
    return v;
  }
  function runs(v) { return arr(v && v.runs); }
  function text(v) {
    if (!v) return null;
    if (typeof v.simpleText === 'string') return v.simpleText || null;
    var s = runs(v).map(function (r) { return r.text || ''; }).join('');
    return s || null;
  }
  function thumbs(r) { return arr(g(r, 'thumbnail', 'thumbnails')); }
  function largest(list) {
    var best = null;
    list.forEach(function (t) { if (t && t.url && (!best || (t.width || 0) > (best.width || 0))) best = t; });
    return best ? best.url : null;
  }
  function pageType(v) {
    var nav = v && v.navigationEndpoint ? v.navigationEndpoint : v;
    return g(nav, 'browseEndpoint', 'browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType') || null;
  }
  function browseId(run) { return g(run, 'navigationEndpoint', 'browseEndpoint', 'browseId') || null; }
  function looksLikeDuration(s) { return s.indexOf(':') >= 0 && s.split(':').every(function (p) { return /^\d+$/.test(p); }); }
  function parseDuration(s) {
    if (!s || !looksLikeDuration(s.trim())) return null;
    return s.trim().split(':').reduce(function (acc, p) { return acc * 60 + Number(p); }, 0);
  }
  /** "3.6B plays", "40.1M", "12K subscribers" → the number. */
  function count(s) {
    if (!s) return null;
    var n = s.trim().split(/\s+/)[0].replace(/,/g, '');
    var mult = { K: 1e3, M: 1e6, B: 1e9 }[n.slice(-1)] || 1;
    if (mult !== 1) n = n.slice(0, -1);
    var v = parseFloat(n);
    return isFinite(v) ? Math.round(v * mult) : null;
  }
  function isArtistType(k) { return k === 'MUSIC_PAGE_TYPE_ARTIST' || k === 'MUSIC_PAGE_TYPE_USER_CHANNEL'; }

  function findVideoType(v, depth) {
    if (!v || typeof v !== 'object' || depth > 12) return null;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) { var a = findVideoType(v[i], depth + 1); if (a) return a; }
      return null;
    }
    if (typeof v.musicVideoType === 'string') return v.musicVideoType;
    for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) { var b = findVideoType(v[k], depth + 1); if (b) return b; } }
    return null;
  }
  function videoType(parts) {
    for (var i = 0; i < parts.length; i++) { var t = findVideoType(parts[i], 0); if (t) return t; }
    return null;
  }
  /** Music videos and other uploads rather than songs (ytm.rs is_video). */
  function isVideo(item) {
    var two = item.musicTwoRowItemRenderer || {}, row = item.musicResponsiveListItemRenderer || {};
    var t = videoType([two.navigationEndpoint, row.overlay, g(row, 'flexColumns', 0), item.navigationEndpoint]);
    return t === 'MUSIC_VIDEO_TYPE_OMV' || t === 'MUSIC_VIDEO_TYPE_UGC' || t === 'MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC';
  }

  function artistLinks(v) {
    return runs(v).filter(function (r) { return isArtistType(pageType(r)); })
      .map(function (r) { return { name: r.text || '', id: browseId(r) }; });
  }
  /** Names in a header strapline, linked when they are. */
  function links(v) {
    return runs(v).map(function (r) { return { name: (r.text || '').trim(), id: browseId(r) }; })
      .filter(function (l) { return l.name && ['•', ',', '&'].indexOf(l.name) < 0; });
  }

  // ---- Items --------------------------------------------------------------------------------
  /** A song row: playlists, search, history, album tracks, Quick picks (ytm.rs list_item). */
  function listItem(r) {
    if (!r) return null;
    var cols = arr(r.flexColumns).map(function (c) { return g(c, 'musicResponsiveListItemFlexColumnRenderer', 'text'); });
    if (!cols.length) return null;
    var title = text(cols[0]);
    if (!title) return null;
    var id = g(r, 'playlistItemData', 'videoId');
    if (!id) runs(cols[0]).some(function (run) { id = g(run, 'navigationEndpoint', 'watchEndpoint', 'videoId'); return !!id; });
    if (!id) return null;
    var artists = [], album = null, duration = null, plays = null, inArtists = true, afterKind = false;
    for (var c = 1; c < cols.length; c++) {
      var rs = runs(cols[c]);
      for (var i = 0; i < rs.length; i++) {
        var run = rs[i], name = run.text || '', kind = pageType(run), trimmed = name.trim();
        if (c === 1 && inArtists) {
          // "Song • Radiohead • OK Computer • 4:59": the separator after a kind label isn't the artists' end.
          if (trimmed === '•' && afterKind) afterKind = false;
          else if (trimmed === '•') inArtists = false;
          else if (trimmed === '' || trimmed === ',' || trimmed === '&') { /* separator */ }
          else if (i === 0 && (trimmed === 'Song' || trimmed === 'Video' || trimmed === 'Episode')) afterKind = true;
          else if (looksLikeDuration(trimmed)) duration = parseDuration(trimmed);
          else if ((!kind || isArtistType(kind)) && !/ plays$/.test(trimmed)) {
            artists.push({ name: trimmed, id: browseId(run) });
          }
          if (inArtists) continue;
        }
        if (isArtistType(kind) && !artists.some(function (a) { return a.name === name; })) artists.push({ name: name, id: browseId(run) });
        else if (kind === 'MUSIC_PAGE_TYPE_ALBUM') album = { name: name, id: browseId(run) };
        else if (duration === null && looksLikeDuration(trimmed)) duration = parseDuration(trimmed);
        else if (/ plays$/.test(trimmed)) plays = count(trimmed);
      }
      inArtists = false;
    }
    var fixed = g(r, 'fixedColumns', 0, 'musicResponsiveListItemFixedColumnRenderer', 'text', 'runs', 0, 'text');
    var fd = parseDuration(fixed);
    if (fd !== null) duration = fd;
    var nr = parseInt(text(r.index), 10);
    return {
      id: id, title: title, artists: artists, album: album, duration: duration,
      thumb: largest(thumbs(g(r, 'thumbnail', 'musicThumbnailRenderer'))),
      trackNr: isFinite(nr) ? nr : null, plays: plays,
      video: videoType([r.overlay, g(r, 'flexColumns', 0)]) === 'MUSIC_VIDEO_TYPE_OMV'
    };
  }

  /** What a browse endpoint opens. */
  function target(nav) {
    var id = g(nav, 'browseEndpoint', 'browseId');
    if (!id) return null;
    switch (pageType(nav)) {
      case 'MUSIC_PAGE_TYPE_ALBUM': case 'MUSIC_PAGE_TYPE_AUDIOBOOK': return { kind: 'album', id: id };
      case 'MUSIC_PAGE_TYPE_ARTIST': case 'MUSIC_PAGE_TYPE_USER_CHANNEL': return { kind: 'artist', id: id };
      case 'MUSIC_PAGE_TYPE_PLAYLIST': return { kind: 'playlist', id: id.replace(/^VL/, '') };
      default: return null;
    }
  }

  /** A square or round card: album, playlist, artist, or a song shown as a card (ytm.rs two_row). */
  function twoRow(r) {
    if (!r) return null;
    var title = text(r.title);
    if (!title) return null;
    var thumb = largest(thumbs(g(r, 'thumbnailRenderer', 'musicThumbnailRenderer')));
    var nav = r.navigationEndpoint || {};
    var tgt;
    var vid = g(nav, 'watchEndpoint', 'videoId');
    var pl = g(nav, 'watchPlaylistEndpoint', 'playlistId');
    if (vid) {
      tgt = { kind: 'song', id: vid, track: { id: vid, title: title, artists: artistLinks(r.subtitle), album: null, duration: null, thumb: thumb, trackNr: null, plays: null, video: videoType([nav]) === 'MUSIC_VIDEO_TYPE_OMV' } };
    } else if (pl) {
      tgt = { kind: 'playlist', id: pl };
    } else {
      tgt = target(nav);
    }
    if (!tgt) return null;
    return { title: title, subtitle: text(r.subtitle) || '', thumb: thumb, target: tgt, round: tgt.kind === 'artist', wide: false };
  }

  /** A list row that opens a page rather than playing (search results, chart artists). */
  function listCard(r) {
    if (!r) return null;
    var tgt = target(r.navigationEndpoint);
    if (!tgt) return null;
    var col = function (i) { return g(r, 'flexColumns', i, 'musicResponsiveListItemFlexColumnRenderer', 'text'); };
    var title = text(col(0));
    if (!title) return null;
    var line = runs(col(1)).map(function (x) { return x.text || ''; }).join('');
    var parts = line.split(' • ').filter(function (p) { return p; });
    if (tgt.kind === 'artist' && parts[0] === 'Artist') parts.shift();
    var subtitle;
    if (tgt.kind === 'playlist') subtitle = ['Playlist'].concat(parts.filter(function (p) { return p !== 'Playlist'; })).join(' • ');
    else if (tgt.kind === 'artist' && !parts.length) subtitle = 'Artist';
    else subtitle = parts.join(' • ');
    return { title: title, subtitle: subtitle, thumb: largest(thumbs(g(r, 'thumbnail', 'musicThumbnailRenderer'))), target: tgt, round: tgt.kind === 'artist', wide: false };
  }

  /** A song in a radio or up-next panel. */
  function panelItem(r) {
    if (!r || !r.videoId) return null;
    var title = text(r.title);
    if (!title) return null;
    var byline = r.longBylineText;
    var artists = artistLinks(byline);
    if (!artists.length && runs(byline).length) artists.push({ name: runs(byline)[0].text || '', id: null });
    var album = null;
    runs(byline).some(function (run) {
      if (pageType(run) === 'MUSIC_PAGE_TYPE_ALBUM') { album = { name: run.text || '', id: browseId(run) }; return true; }
      return false;
    });
    return { id: r.videoId, title: title, artists: artists, album: album, duration: parseDuration(text(r.lengthText)), thumb: largest(thumbs(r)), trackNr: null, plays: null, video: videoType([r.navigationEndpoint]) === 'MUSIC_VIDEO_TYPE_OMV' };
  }

  // ---- Shelves --------------------------------------------------------------------------------
  function shelf(s) {
    var r = s && s.musicCarouselShelfRenderer;
    if (!r) return null;
    var h = g(r, 'header', 'musicCarouselShelfBasicHeaderRenderer');
    var title = text(h && h.title);
    if (!title) return null;
    var items = arr(r.contents).filter(function (i) { return !isVideo(i); });
    var out = { title: title, strapline: text(h.strapline), more: g(h, 'moreContentButton', 'buttonRenderer', 'navigationEndpoint', 'browseEndpoint') || null };
    if (items.some(function (i) { return i.musicResponsiveListItemRenderer; })) {
      out.kind = 'songs';
      out.items = items.map(function (i) { return listItem(i.musicResponsiveListItemRenderer); }).filter(Boolean);
      out.rows = parseInt(r.numItemsPerColumn, 10) || 4;
    } else {
      out.kind = 'cards';
      out.items = items.map(function (i) { return twoRow(i.musicTwoRowItemRenderer); }).filter(Boolean);
    }
    return out.items.length ? out : null;
  }
  function shelves(contents) { return arr(contents).map(shelf).filter(Boolean); }
  function continuation(sec) { return g(sec, 'continuations', 0, 'nextContinuationData', 'continuation') || null; }
  function itemToken(items) {
    var t = null;
    arr(items).some(function (i) { t = g(i, 'continuationItemRenderer', 'continuationEndpoint', 'continuationCommand', 'token'); return !!t; });
    return t || null;
  }
  function singleColumnSections(v) {
    return arr(g(v, 'contents', 'singleColumnBrowseResultsRenderer', 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer', 'contents'));
  }

  // ---- Pages ------------------------------------------------------------------------------
  function parseHome(v) {
    var sec = g(v, 'contents', 'singleColumnBrowseResultsRenderer', 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer') || {};
    var chips = arr(g(sec, 'header', 'chipCloudRenderer', 'chips')).map(function (c) {
      c = c.chipCloudChipRenderer || {};
      var selected = !!c.isSelected;
      // A selected chip's own endpoint re-selects it; deselecting returns to the default feed.
      var ep = selected ? c.onDeselectedCommand : c.navigationEndpoint;
      var title = text(c.text);
      return title ? { title: title, params: g(ep, 'browseEndpoint', 'params') || null, selected: selected } : null;
    }).filter(Boolean);
    return { chips: chips, shelves: shelves(sec.contents), continuation: continuation(sec) };
  }
  function parseHomeMore(v) {
    var sec = g(v, 'continuationContents', 'sectionListContinuation') || {};
    return { chips: [], shelves: shelves(sec.contents), continuation: continuation(sec) };
  }

  function parseSuggestions(v) {
    var out = [];
    arr(g(v, 'contents', 0, 'searchSuggestionsSectionRenderer', 'contents')).forEach(function (i) {
      var r = i.historySuggestionRenderer || i.searchSuggestionRenderer;
      var t = r && text(r.suggestion);
      if (t) out.push(t);
    });
    return out;
  }

  /** Search: the top result card, then shelves by kind, in YouTube's order. */
  function parseSearch(v) {
    var sections = arr(g(v, 'contents', 'tabbedSearchResultsRenderer', 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer', 'contents'));
    var out = { top: null, songs: [], albums: [], artists: [], playlists: [], videos: [] };
    sections.forEach(function (s) {
      var card = s.musicCardShelfRenderer;
      if (card) {
        var nav = g(card, 'title', 'runs', 0, 'navigationEndpoint') || card.onTap;
        var vid = g(nav, 'watchEndpoint', 'videoId');
        var tgt = vid ? { kind: 'song', id: vid } : target(nav);
        if (tgt) {
          var thumb = largest(thumbs(g(card, 'thumbnail', 'musicThumbnailRenderer')));
          var title = text(card.title) || '';
          if (vid) tgt.track = { id: vid, title: title, artists: artistLinks(card.subtitle), album: null, duration: null, thumb: thumb, trackNr: null, plays: null, video: false };
          out.top = { title: title, subtitle: text(card.subtitle) || '', thumb: thumb, target: tgt, round: tgt.kind === 'artist', wide: false };
        }
        // Songs under an artist's top card leave the artist out ("Song • 3:11").
        var cardArtist = out.top && out.top.target.kind === 'artist' ? { name: out.top.title, id: out.top.target.id } : null;
        arr(card.contents).forEach(function (i) {
          var t = add(i);
          if (t && !t.artists.length && cardArtist) t.artists.push(cardArtist);
        });
        return;
      }
      arr(g(s, 'musicShelfRenderer', 'contents')).forEach(function (i) { add(i); });
      // Since 2026 the "All" tab interleaves one-result sections instead of kind shelves.
      arr(g(s, 'itemSectionRenderer', 'contents')).forEach(function (i) { add(i); });
    });
    function add(i) {
      var r = i.musicResponsiveListItemRenderer;
      if (!r) return;
      var c = listCard(r);
      if (c) {
        var bucket = c.target.kind === 'album' ? out.albums : c.target.kind === 'artist' ? out.artists : out.playlists;
        if (!bucket.some(function (x) { return x.target.id === c.target.id; })) bucket.push(c);
        return;
      }
      var t = listItem(r);
      if (!t) return null;
      var list = isVideo(i) ? out.videos : out.songs;
      if (list.some(function (x) { return x.id === t.id; })) return null;
      list.push(t);
      return t;
    }
    return out;
  }

  /** The header of an album or playlist page; your own playlists wrap it in an editable one. */
  function header(two) {
    var c = g(two, 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer', 'contents', 0) || {};
    return c.musicResponsiveHeaderRenderer || g(c, 'musicEditablePlaylistDetailHeaderRenderer', 'header', 'musicResponsiveHeaderRenderer') || null;
  }

  function parseAlbum(v, id) {
    var two = g(v, 'contents', 'twoColumnBrowseResultsRenderer');
    var h = header(two);
    var title = h && text(h.title);
    if (!title) return null;
    var words = runs(h.subtitle).map(function (r) { return r.text; }).filter(function (t) { return t && t.trim() !== '•'; });
    var kind = words[0] || 'Album';
    var year = null;
    words.slice().reverse().some(function (w) { if (/^\d{4}$/.test(w)) { year = w; return true; } return false; });
    var artists = links(h.straplineTextOne);
    var names = artists.map(function (a) { return a.name; }).join(', ');
    var thumb = largest(thumbs(g(h, 'thumbnail', 'musicThumbnailRenderer')));
    var link = { name: title, id: id };
    var tracks = [];
    arr(g(two, 'secondaryContents', 'sectionListRenderer', 'contents')).forEach(function (s) {
      arr(g(s, 'musicShelfRenderer', 'contents')).forEach(function (i) {
        var t = listItem(i.musicResponsiveListItemRenderer);
        if (!t) return;
        if (!t.thumb) t.thumb = thumb;          // album rows leave out what the header says
        if (!t.artists.length) t.artists = artists.slice();
        if (!t.album) t.album = link;
        tracks.push(t);
      });
    });
    var playlistId = null;
    arr(h.buttons).some(function (b) {
      var play = g(b, 'musicPlayButtonRenderer', 'playNavigationEndpoint') || {};
      playlistId = g(play, 'watchPlaylistEndpoint', 'playlistId') || g(play, 'watchEndpoint', 'playlistId') || g(b, 'downloadButtonRenderer', 'command', 'offlinePlaylistEndpoint', 'playlistId');
      return !!playlistId;
    });
    return {
      id: id, isAlbum: true, title: title,
      subtitle: [kind, names, year].filter(Boolean).join(' • '),
      meta: text(h.secondSubtitle) || '',
      artists: artists, description: text(g(h, 'description', 'musicDescriptionShelfRenderer', 'description')),
      thumb: thumb, tracks: tracks, playlistId: playlistId || null
    };
  }

  function listPage(items) {
    return {
      tracks: arr(items).map(function (i) { return listItem(i.musicResponsiveListItemRenderer); }).filter(Boolean),
      token: itemToken(items)
    };
  }

  function parsePlaylist(v, id) {
    var two = g(v, 'contents', 'twoColumnBrowseResultsRenderer');
    var h = header(two);
    var title = h && text(h.title);
    if (!title) return null;
    var first = g(two, 'secondaryContents', 'sectionListRenderer', 'contents', 0) || {};
    var shelfR = first.musicPlaylistShelfRenderer || first.musicShelfRenderer || {};
    var page = listPage(shelfR.contents);
    var face = g(h, 'facepile', 'avatarStackViewModel');
    var owners = [];
    var faceName = g(face, 'text', 'content');
    if (faceName) owners.push({ name: faceName, id: g(face, 'rendererContext', 'commandContext', 'onTap', 'innertubeCommand', 'browseEndpoint', 'browseId') || null });
    owners = owners.concat(links(h.straplineTextOne));
    var countN = null;
    runs(h.secondSubtitle).some(function (r) {
      var t = r.text || '';
      if (/song|track|episode|video/.test(t)) { countN = parseInt(t.split(/\s+/)[0].replace(/,/g, ''), 10); return true; }
      return false;
    });
    var th = h.thumbnail || {};
    return {
      id: id, isAlbum: false, title: title,
      subtitle: owners.length ? owners[0].name : '',
      meta: text(h.secondSubtitle) || '',
      artists: owners.filter(function (o) { return o.id; }),
      description: text(g(h, 'description', 'musicDescriptionShelfRenderer', 'description')),
      thumb: largest(thumbs(th.musicThumbnailRenderer || th.croppedSquareThumbnailRenderer)),
      tracks: page.tracks,
      token: page.token || continuation(shelfR),
      count: isFinite(countN) ? countN : null
    };
  }

  function parsePlaylistMore(v) {
    var items = g(v, 'onResponseReceivedActions', 0, 'appendContinuationItemsAction', 'continuationItems');
    if (items) return listPage(items);
    var s = g(v, 'continuationContents', 'musicPlaylistShelfContinuation') || {};
    var p = listPage(s.contents);
    p.token = p.token || continuation(s);
    return p;
  }

  function parseArtist(v, id) {
    var hdr = v && v.header ? (v.header.musicImmersiveHeaderRenderer || v.header.musicVisualHeaderRenderer) : null;
    var name = hdr && text(hdr.title);
    if (!name) return null;
    var sub = g(hdr, 'subscriptionButton', 'subscribeButtonRenderer');
    var page = {
      id: id, name: name,
      banner: largest(thumbs(g(hdr, 'thumbnail', 'musicThumbnailRenderer'))),
      subscribers: text(g(sub, 'subscriberCountText')) || text(g(sub, 'shortSubscriberCountText')),
      description: text(hdr.description),
      top: [], topPlaylist: null, shelves: []
    };
    singleColumnSections(v).forEach(function (s) {
      var ms = s.musicShelfRenderer;
      if (ms && !page.top.length) {
        page.top = arr(ms.contents).map(function (i) { return listItem(i.musicResponsiveListItemRenderer); }).filter(Boolean);
        var ep = ms.bottomEndpoint || g(ms, 'title', 'runs', 0, 'navigationEndpoint');
        var b = g(ep, 'browseEndpoint', 'browseId');
        page.topPlaylist = b ? b.replace(/^VL/, '') : null;
        return;
      }
      if (!page.description) page.description = text(g(s, 'musicDescriptionShelfRenderer', 'description'));
      var sh = shelf(s);
      if (sh && sh.kind === 'cards') {
        // Release shelves list only the year: spell out the kind and the artist, as PC does.
        var kind = /^Single/.test(sh.title) ? 'Single' : 'Album';
        sh.items.forEach(function (c) {
          if (c.target.kind === 'album') c.subtitle = [kind, c.subtitle].filter(Boolean).join(' • ');
        });
        page.shelves.push(sh);
      }
    });
    return page;
  }

  function panelPage(panel) {
    var items = arr(panel && panel.contents).map(function (i) {
      var r = g(i, 'playlistPanelVideoWrapperRenderer', 'primaryRenderer', 'playlistPanelVideoRenderer') || i.playlistPanelVideoRenderer;
      var t = panelItem(r);
      return t ? { track: t, video: isVideo(r || {}) } : null;
    }).filter(Boolean);
    return { items: items, token: g(panel, 'continuations', 0, 'nextRadioContinuationData', 'continuation') || null };
  }
  /** A radio's songs, without its videos; all of it when it's videos only (ytm.rs radio_tracks). */
  function radioTracks(items) {
    var songs = items.some(function (i) { return !i.video; });
    return items.filter(function (i) { return !songs || !i.video; }).map(function (i) { return i.track; });
  }
  function parseRadio(v) {
    var panel = g(v, 'contents', 'singleColumnMusicWatchNextResultsRenderer', 'tabbedRenderer', 'watchNextTabbedResultsRenderer', 'tabs', 0, 'tabRenderer', 'content', 'musicQueueRenderer', 'content', 'playlistPanelRenderer');
    var p = panelPage(panel);
    return { tracks: radioTracks(p.items), token: p.token };
  }
  function parseRadioMore(v) {
    var p = panelPage(g(v, 'continuationContents', 'playlistPanelContinuation'));
    return { tracks: radioTracks(p.items), token: p.token };
  }

  function gridCards(sections) {
    var out = [];
    arr(sections).forEach(function (s) {
      arr(g(s, 'gridRenderer', 'items')).forEach(function (i) { var c = twoRow(i.musicTwoRowItemRenderer); if (c) out.push(c); });
    });
    return out;
  }
  /** New releases: the grid (once all of it, now a single mix) plus the "Albums & singles" carousel. */
  function parseNewAlbums(v) {
    var sections = singleColumnSections(v);
    var out = gridCards(sections);
    shelves(sections).forEach(function (s) { if (s.kind === 'cards') out = out.concat(s.items); });
    return out;
  }

  function parseCharts(v) {
    var c = { top: [], playlists: [], artists: [] };
    singleColumnSections(v).forEach(function (s) {
      arr(g(s, 'musicCarouselShelfRenderer', 'contents')).filter(function (i) { return !isVideo(i); }).forEach(function (i) {
        var card = twoRow(i.musicTwoRowItemRenderer);
        if (card) { if (card.target.kind === 'playlist') c.playlists.push(card); return; }
        var r = i.musicResponsiveListItemRenderer;
        var lc = listCard(r);
        if (lc && lc.target.kind === 'artist') c.artists.push(lc);
        else if (c.top.length < 100) { var t = listItem(r); if (t) c.top.push(t); }
      });
    });
    return c;
  }

  /** Moods & genres tiles, with the stripe colour each button carries. */
  function parseMoods(v) {
    var groups = [];
    singleColumnSections(v).forEach(function (s) {
      var grid = s.gridRenderer;
      if (!grid) return;
      var tiles = arr(grid.items).map(function (i) {
        var b = i.musicNavigationButtonRenderer;
        var be = g(b, 'clickCommand', 'browseEndpoint');
        if (!b || !be) return null;
        var argb = g(b, 'solid', 'leftStripeColor');
        if (typeof argb !== 'number') argb = 0xff444444;
        var rgb = 'rgb(' + ((argb >>> 16) & 255) + ',' + ((argb >>> 8) & 255) + ',' + (argb & 255) + ')';
        return { title: text(b.buttonText) || '', color: rgb, browseId: be.browseId, params: be.params || null };
      }).filter(Boolean);
      if (tiles.length) groups.push({ title: text(g(grid, 'header', 'gridHeaderRenderer', 'title')) || '', tiles: tiles });
    });
    return groups;
  }

  /** A See All, mood or genre page: shelves, a grid, or a track list. */
  function parseBrowse(v) {
    var sections = singleColumnSections(v);
    var grid = gridCards(sections);
    var tracks = [];
    sections.forEach(function (s) {
      var r = s.musicPlaylistShelfRenderer || s.musicShelfRenderer;
      if (r) arr(r.contents).forEach(function (i) { var t = listItem(i.musicResponsiveListItemRenderer); if (t) tracks.push(t); });
    });
    var title = text(g(v, 'header', 'musicHeaderRenderer', 'title')) || text(g(v, 'header', 'musicImmersiveHeaderRenderer', 'title')) || '';
    return { title: title, shelves: shelves(sections), grid: grid, tracks: tracks };
  }

  /** The stream to play (innertube.rs audio_stream): Opus 251, else AAC 140, else 139. */
  function parsePlayer(v, itags) {
    var st = (v && v.playabilityStatus) || {};
    if (st.status !== 'OK') {
      var e = new Error(st.reason || 'This song is not playable');
      e.unplayable = true;
      throw e;
    }
    var formats = arr(g(v, 'streamingData', 'adaptiveFormats'));
    var a = g(v, 'playerConfig', 'audioConfig') || {};
    var out = [];
    itags.forEach(function (itag) {
      var f = formats.filter(function (x) { return x.itag === itag && x.url; })[0];
      if (!f) return;
      var loud = typeof f.loudnessDb === 'number' ? f.loudnessDb : null;
      if (loud === null) {
        var track = typeof a.trackAbsoluteLoudnessLkfs === 'number' ? a.trackAbsoluteLoudnessLkfs : a.perceptualLoudnessDb;
        if (typeof track === 'number') loud = track - (typeof a.loudnessTargetLkfs === 'number' ? a.loudnessTargetLkfs : -14);
      }
      out.push({
        itag: itag, url: f.url, opus: itag === 251,
        mime: f.mimeType || '',
        kbps: Math.round((f.averageBitrate || f.bitrate || 0) / 1000),
        durationMs: Number(f.approxDurationMs) || 0,
        loudnessDb: loud
      });
    });
    if (!out.length) throw new Error('No audio stream for this song');
    var vd = g(v, 'videoDetails') || {};
    return { streams: out, title: vd.title || '', lengthSec: Number(vd.lengthSeconds) || 0, thumb: largest(arr(g(vd, 'thumbnail', 'thumbnails'))) };
  }

  // ---- API ----------------------------------------------------------------------------------
  var FILTERS = {
    songs: 'EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D',
    albums: 'EgWKAQIYAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D',
    artists: 'EgWKAQIgAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D',
    playlists: 'EgeKAQQoADgBahIQAxAEEAkQDhAKEAUQERAQEBU%3D'
  };
  function api() { return BC.net; }

  BC.yt = {
    // parsers (exported for tests)
    parseHome: parseHome, parseHomeMore: parseHomeMore, parseSuggestions: parseSuggestions,
    parseSearch: parseSearch, parseAlbum: parseAlbum, parsePlaylist: parsePlaylist,
    parsePlaylistMore: parsePlaylistMore, parseArtist: parseArtist, parseRadio: parseRadio,
    parseRadioMore: parseRadioMore, parseNewAlbums: parseNewAlbums, parseCharts: parseCharts,
    parseMoods: parseMoods, parseBrowse: parseBrowse, parsePlayer: parsePlayer,
    parseDuration: parseDuration, count: count,

    home: function (params) {
      var body = { browseId: 'FEmusic_home' };
      if (params) body.params = params;
      return api().ytm('browse', body).then(parseHome);
    },
    homeMore: function (token) { return api().ytm('browse', { continuation: token }).then(parseHomeMore); },
    suggestions: function (input) { return api().ytm('music/get_search_suggestions', { input: input }).then(parseSuggestions); },
    search: function (query) { return api().ytm('search', { query: query }).then(parseSearch); },
    searchSongs: function (query) {
      return api().ytm('search', { query: query, params: FILTERS.songs }).then(function (v) { return parseSearch(v).songs; });
    },
    album: function (id) {
      return api().ytm('browse', { browseId: id }).then(function (v) {
        var a = parseAlbum(v, id);
        if (!a) throw new Error('YouTube Music returned an empty album');
        return a;
      });
    },
    playlist: function (id) {
      return api().ytm('browse', { browseId: 'VL' + id }).then(function (v) {
        var p = parsePlaylist(v, id);
        if (!p) throw new Error('YouTube Music returned an empty playlist');
        return p;
      });
    },
    playlistMore: function (token) { return api().ytm('browse', { continuation: token }).then(parsePlaylistMore); },
    artist: function (id) {
      return api().ytm('browse', { browseId: id }).then(function (v) {
        var a = parseArtist(v, id);
        if (!a) throw new Error('YouTube Music returned an empty artist page');
        return a;
      });
    },
    /** Songs to play after videoId: its radio (ytm.rs radio), at least `limit` when there are enough. */
    radio: function (videoId, limit) {
      limit = limit || 25;
      var body = { playlistId: 'RDAMVM' + videoId, params: 'wAEB8gECeAE%3D', enablePersistentPlaylistPanel: true, isAudioOnly: true, tunerSettingValue: 'AUTOMIX_SETTING_NORMAL' };
      return api().ytm('next', body).then(function (v) {
        var r = parseRadio(v);
        if (r.tracks.length >= limit || !r.token) return r.tracks;
        return api().ytm('next', { continuation: r.token, enablePersistentPlaylistPanel: true, isAudioOnly: true })
          .then(function (m) { return r.tracks.concat(parseRadioMore(m).tracks); }, function () { return r.tracks; });
      });
    },
    newAlbums: function () { return api().ytm('browse', { browseId: 'FEmusic_new_releases_albums' }).then(parseNewAlbums); },
    charts: function () {
      return api().ytm('browse', { browseId: 'FEmusic_charts', params: 'sgYPRkVtdXNpY19leHBsb3Jl', formData: { selectedValues: ['US'] } }).then(parseCharts);
    },
    moods: function () { return api().ytm('browse', { browseId: 'FEmusic_moods_and_genres' }).then(parseMoods); },
    browse: function (browseId, params) {
      var body = { browseId: browseId };
      if (params) body.params = params;
      return api().ytm('browse', body).then(parseBrowse);
    },
    player: function (videoId, itags) {
      return api().player(videoId).then(function (v) { return parsePlayer(v, itags); });
    }
  };
})(typeof window !== 'undefined' ? window : global);

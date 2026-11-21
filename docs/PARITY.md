# Parity checklist

Short form of [FEATURE_MATRIX.md](FEATURE_MATRIX.md), which gives each reason in full.

**Verified** means checked in the headless-browser harness: real YouTube data, driven by arrow keys. Only the probe has run on a real TV so far.

## Done

- [x] Home: mood chips, hero shelf, card shelves, song columns, feed continuation
- [x] New: new releases, charts, moods & genres tiles
- [x] Search: on-screen keyboard in 5 layouts plus symbols, live suggestions, history on the TV, grouped results
- [x] Album and playlist pages, with Play, Shuffle and Save; playlist continuation
- [x] Artist page: banner, top songs, releases, similar artists, about
- [x] Playback: VISIONOS `/player` and AAC, with format failover
- [x] Queue: shuffle, repeat off / all / one, Play next, Add to queue, Remove from queue
- [x] Autoplay song radio, next-track prefetch, volume normalization, sleep timer
- [x] Now Playing:
  - [x] soft cover-colour backdrop and cover accent (PC shader replaced, see Partial);
  - [x] synced lyrics with word timing, blur on upcoming lines, the 0.43 anchor, instrumental gaps;
  - [x] Up next and the quality label.
- [x] Now Playing in the sidebar and a compact mini player; the cover flies into Now Playing
- [x] Lyrics: Unison, then lrc.red, then LRCLIB, order set in Settings
- [x] Settings: autoplay, normalization, quality label, lyric sources and size, animated background, reduce motion, clear history and library, connection check, about
- [x] Remote:
  - [x] spatial navigation with per-row memory and held-arrow acceleration;
  - [x] long-press OK menus and the Back chain;
  - [x] media and number keys.

## Partial

- [ ] **Library:** kept on this TV only. Syncing with an account needs sign-in (an open decision).
- [ ] **Audio:** AAC first, because the test TV fails to decode Opus.
- [ ] **Backdrop:** a soft blur of the cover rather than PC's warp shader, which looked poor on the TV.
- [ ] **Background audio:** off, so audio may stop when you switch TV apps.
- [ ] **Music-video rows:** they play as listed. PC's song-matching search isn't ported.

## Not possible on a Tizen web app

- Google sign-in as PC does it: no `Cookie` header from JavaScript, and no local server.
- Better Lyrics API: needs a Cloudflare Turnstile JWT.
- Translation and romanization: Google Translate refuses page requests.
- Animated Apple artwork: needs Apple's scraped token and an `Origin` header.
- Crossfade and Automix: two simultaneous decoders aren't reliable on TVs.

## Removed

- Listen Together / Jam, Discord, tray and title bar, Windows media keys, Last.fm, Spotify transfer, hi-res sources, uploads and downloads, proxy settings.
- SponsorBlock skipping.
- The splash animation (felt laggy on the test TV).
- Colour-key shortcuts (many remotes have no colour keys).
- The on-TV service app.

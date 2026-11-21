# Feature matrix

Status of each BitChord PC feature on Android TV (the `tv/` module of kushagrasinghx/BitChord) and in this Tizen port.

- **Done:** works the way the PC app works.
- **Partial:** works with a stated limit.
- **Not possible:** cannot be built on Tizen, with the reason.
- **Removed:** dropped on purpose by the brief.

PC sources are under `ref/pc/src`. "Android TV" is read from `tv/src/**`.

## Screens

| Screen | PC | Android TV | Tizen | Notes |
|---|---|---|---|---|
| Splash | — | TvStartup | Done | Logo mark springs in, the arcs draw, a sheen passes, the wordmark fades up. Under 1.5 s, transform and opacity only. |
| Home: mood chips, shelves, quick picks, continuation | `pages.rs::home`, `ytm.rs::home/home_more` | TvHomeScreen | Done | Chips re-request the feed with the chip's `params`. More shelves load as focus nears the end. |
| New: new releases, top songs, charts | `pages.rs::new` | TvExploreScreen | Done | `FEmusic_new_releases_albums` and `FEmusic_charts` (US). |
| Moods & genres | Home chips | TvExploreScreen | Done | `FEmusic_moods_and_genres` tiles open a browse page. |
| Search with suggestions and history | `pages.rs` search, `ytm.rs::suggestions` | TvSearchScreen | Done | Custom on-screen keyboard. History is stored on the TV. |
| Search results by kind | `search_cards`, filters | TvSearchScreen | Done | Top result plus Songs, Albums, Artists and Playlists rows. |
| Album | `ytm.rs::album` | TvDetailScreen | Done | Music-video rows are swapped for their song versions on PC; on TV they play as listed (see Partial below). |
| Playlist | `ytm.rs::playlist` | TvDetailScreen | Done | First page plus continuation, capped at 500 tracks for mixes, as on PC. |
| Artist | `ytm.rs::artist` | TvArtistPage | Done | Banner, top songs, albums, singles, playlists, similar artists. |
| Library: playlists, songs, albums, history | `pages.rs::library` (signed in) | TvLibraryScreen | Partial | Kept on this TV: liked songs, saved albums and playlists, history. Syncing with a YouTube account is blocked on sign-in (see below). |
| Library: uploads | `ytm.rs::uploads` | — | Not possible | Needs a signed-in account. |
| Now Playing: cover backdrop, accent from cover | `nowplaying.rs`, `shader.rs` | TvNowPlayingScreen | Done | The PC warp shader runs in WebGL on a 96×54 canvas scaled up by CSS, which supplies the blur. Without WebGL, a 2D canvas fallback drifts the scaled cover. |
| Now Playing: synced lyrics, word timing | `karaoke.rs`, `lyrics.rs` | TvNowPlayingParts | Done | Word-timed lines light up word by word. Upcoming lines blur, past lines fade, and the active line sits at the 0.43 anchor. |
| Now Playing: Up next (queue) | `queue.rs` | yes | Done | Panel beside the art. OK plays the focused song; long-press OK opens Remove and Play next. |
| Mini player | `mini.rs` | yes | Done | Bar along the bottom of every page while something plays. OK opens Now Playing. |
| Settings | `ui/mod.rs` settings | TvSettingsScreen | Done | Only the TV-relevant settings (list below). |
| Connection check | — | — | Done | Every route tried, with its result, the platform version and codec support. Opens by itself when YouTube cannot be reached. |

## Playback

| Feature | PC | Tizen | Notes |
|---|---|---|---|
| VISIONOS `/player`, plain URLs, no PO token | `innertube.rs` | Done | Sent as a CORS-simple request. Visitor data from a WEB_REMIX browse is required, or YouTube answers "Sign in to confirm you're not a bot". |
| Opus 251, then AAC 140, then 139 | `innertube.rs` | Done | `canPlayType` picks the order. A decode error moves to the next format automatically. |
| Shuffle, repeat (off / all / one) | yes | Done | |
| Autoplay (song radio when the queue ends) | `ytm.rs::radio` | Done | `RDAMVM<id>` with the PC's `params`. Music videos are dropped when songs exist, as on PC. |
| Start radio from any song | yes | Done | Long-press OK › Start radio. |
| Next-track prefetch | `stream.rs` | Done | The next song's `/player` response is fetched 20 s before the end. Stream URLs are only valid for a few hours, so they are fetched again when older than that. |
| Volume normalization | `audio.rs` | Done | Gain from `loudnessDb`, falling back to the track loudness against −14 LUFS. Only turns the volume down, never above 1.0. |
| Quality indicator | `quality` | Done | "Opus 160 kbps" or "AAC 128 kbps" in Now Playing. |
| Sleep timer | yes | Done | 15, 30, 45 or 60 min, or end of song. |
| SponsorBlock-style skip | `sponsorblock.rs` | Done | Same categories as PC (`music_offtopic`, `sponsor`, `selfpromo`, `interaction`), looked up by SHA-256 prefix, and only for music videos, as on PC. |
| Crossfade, Automix | yes | Not possible | One hardware decoder on many TVs, so two overlapping `<audio>` streams are not reliable. |
| Logarithmic volume, output device | yes | Not possible | The TV's own volume keys and audio output apply. |
| Hi-res sources (Qobuz and similar) | `hires.rs` | Removed | Brief: hi-res addon sources. |
| Play songs, not music videos | `searched_song` | Partial | Album rows that are music videos play as listed; the PC's song-matching search is not ported. |

## Lyrics

| Provider | PC priority | Tizen | Notes |
|---|---|---|---|
| Better Lyrics API (BLyrics, Bini, Musixmatch, LRCLib, Legato, Portato) | 1 | Not possible | Needs a JWT from a Cloudflare Turnstile token, which cannot be produced on a TV. |
| Unison (`unison.betterlyrics.org`) | 2 | Done | TTML, LRC or plain. The probe confirmed it is readable from a page. |
| lrc.red | 3 | Done | Search, best hit by title, artist and ±20 s, then TTML by ISRC (`best_lrcred_hit`). |
| LRCLIB (`lrclib.net`, direct) | via BLyrics on PC | Done | Replaces the BLyrics route to the same data. `get`, then `search`. Backs off on 429. |
| Translation, romanization | `translate.rs` | Not possible | Google Translate refuses page requests (429, see fixtures README). |

## Settings on TV

| Setting | Tizen | Notes |
|---|---|---|
| Autoplay | Done | |
| Volume normalization | Done | |
| Skip non-music parts | Done | |
| Audio format: Opus first / AAC only | Done | AAC only is for TVs that report Opus but fail to decode it. |
| Animated background | Done | Off shows a still, blurred cover. |
| Reduce motion | Done | Also follows `prefers-reduced-motion`. |
| Lyrics: sources and their order, text size | Done | |
| Show audio quality | Done | |
| Clear search history, clear library on this TV | Done | Both ask first. |
| Connection check | Done | |
| About and licenses | Done | GPL-3.0 and the font licenses. |

## Removed or not applicable

| PC feature | Reason |
|---|---|
| Listen Together / Jam (`jam.rs`, `ui/jam.rs`, `deeplink.rs`, party server, presence) | Removed by the brief. |
| Discord Rich Presence | No Discord client on the TV. |
| Tray, window title bar, close to tray, collapse sidebar | No windows on a TV. |
| Windows media keys | The remote's media keys are registered through `tizen.tvinputdevice` instead. |
| Last.fm | Not applicable on TV (brief). |
| Spotify transfer | Not applicable on TV (brief). |
| Hi-res addon sources | Not applicable on TV (brief). |
| File uploads, Downloads page, download folder | No file system the user can browse; not applicable (brief). |
| Proxy setting, signature service, yt-dlp, EJS solver | No proxy (brief). VISIONOS URLs need no signature solving. |
| Animated (motion) artwork | `motion.rs` fetches Apple HLS clips through Apple's web token. That needs `amp-api.music.apple.com` with a scraped token and an `Origin` header, which a page cannot send. |
| Theme presets editor | One look, the PC default with the Apple Music lyric preset. |

## Signed-in features

On PC these need a Google account: Library (playlists, albums, songs, uploads), likes, history sync, playlist editing, the personalized home and "New releases for you", the search history kept on the account, and the cross-device queue (Premium).

**Why the PC sign-in cannot work here.** The PC app signs in through a webview and then sends the session cookie with a `SAPISIDHASH` `Authorization` header. A Tizen web app cannot set `Cookie` from JavaScript at all (it is a forbidden header). Any custom header also turns the request into a CORS preflight, which youtubei answers with 400. Android TV pairs a phone through a small web server on the TV (`TvAuthServer.kt`, port 8765), and a Tizen web app cannot listen on a socket either.

**What ships instead.** Likes, saved albums and playlists, and history are kept on this TV, and each Library screen says so. Account sign-in is an open decision for the user (see README).

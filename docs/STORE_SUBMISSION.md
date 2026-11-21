# Samsung store submission note

**Recommendation: don't submit yet.** Install by sideloading in Developer Mode (see README). The store review is likely to reject the app, for these reasons.

## Risks

- **YouTube's terms:**
  - The app is an unofficial YouTube Music client.
  - It calls YouTube's internal `youtubei` API as other clients (WEB_REMIX and VISIONOS) and plays streams without YouTube's player or ads.
  - YouTube's terms of service forbid this, and Samsung's content review checks third-party content rights.
- **Trademarks:** the store listing can't use "YouTube" or YouTube Music branding.
- **Fragility:** YouTube can change or close the VISIONOS route at any time, as it has closed earlier clients. A store app that suddenly can't play gets bad reviews and can be pulled.
- **Lyrics rights:** Unison, lrc.red and LRCLIB are community services; the lyrics' publishers haven't licensed them for this use.

## If you submit anyway

1. Sign with a distributor certificate for public release, not the development certificate with your TV's DUID.
2. Assets are generated in `store/` (`node tools/icons.js`):
   - icons at 512×512, 512×423 and 1024×1024;
   - a 1920×1080 splash and banner.

   Check them against the current list in Samsung Apps TV Seller Office before uploading. The required sizes change between platform years.
3. Screenshots at 1920×1080 are in `docs/screenshots/`.
4. Version is `0.1.0` in `app/config.xml`; package ID is `bchordtv01`.
5. The source is GPL-3.0, so the store listing must link to it: <https://github.com/haarryyyyyyy/bitchordtv-claude>.

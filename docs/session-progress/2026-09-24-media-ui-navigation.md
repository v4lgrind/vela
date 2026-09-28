# Media UI and navigation — 2026-09-24

## Investigation
- The web video timeline used a custom click target; the Android player uses a separate native SeekBar.
- Library filters and sort settings lived only in the list component and were lost on navigation.
- Vue Router had no scroll behavior; new routes inherited the previous document position.
- Recently added episodes used episode artwork in portrait-sized cards.

## Changes
- Web playback uses an accent-themed, full-width range control. Tap, drag, and keyboard seeks work across the track; dragging holds a time preview until release. Android playback uses a higher-resolution seek range and handles taps and drags anywhere along the native track.
- Library sort, filter, genre, letter and page state are saved in session storage per server, user and library; returning to a library restores them.
- New routes scroll to the top; browser-history navigation restores the saved scroll position.
- Recently added episodes request their series portrait artwork with a parent-art fallback; cards keep a 2:3 aspect ratio.

## Verification and limits
- `npm run build` passed (Vue type check and production Vite build).
- Browser preview with a stubbed media store: new-route scroll moved from y=584 to y=0 and browser Back restored y=584; library selections survived opening a media detail and returning; recent episode displayed series artwork in a portrait card; web player accepted a tap in the unplayed track and committed a drag while preserving its preview until release.
- Android native playback could not be exercised or compiled here: `./gradlew :app:compileDebugKotlin --offline` failed because the configured Android SDK directory does not exist. Verify track taps/drags on a device after installing/configuring the SDK.

# Vela

Vela is a media player for your own **Jellyfin** or **Plex** server: films, series and
music on Android (phone, tablet, Android TV), Windows and Linux.

## What it does

- 🎬 Films and series, with resume, "up next", skip intro and seek-bar previews
- 🎵 Music in original quality (FLAC included), lyrics, playlists, background playback
- ⬇️ Downloads to watch or listen offline
- 📡 Cast to a TV or speaker, 🚗 Android Auto
- 👥 Several servers and accounts side by side, Plex Home profiles

## Install

Download the latest version from the [Releases page](https://github.com/v4lgrind/vela/releases):

| Device | File |
|---|---|
| Android | `Vela-<version>-android.apk` — open it on the phone and allow the install |
| Windows | `Vela-<version>-windows-x64.exe` |
| Linux | `Vela-<version>-linux-x86_64.AppImage` (make it executable, then run it) |

Updates install over the previous version and keep your accounts and downloads.

## Connect to your server

**Jellyfin** — choose *Jellyfin*, enter the server address (for example
`http://192.168.1.10:8096`), then your username and password. *Quick Connect*
also works if it is enabled on your server.

**Plex** — choose *Plex*, tap *Get a code*, open [plex.tv/link](https://plex.tv/link)
on any device and enter the code. Pick your profile (and its PIN if it has one),
then your server. At home Vela uses your local network; elsewhere it switches to
the internet address by itself.

To add another server or account: *Settings → Switch server*. Plex users can
change profile from *Settings → Switch Plex profile*.

## Good to know

- **Offline:** downloaded items appear in *Downloads* and play without network,
  with their artwork. *Settings → Force offline mode* simulates having no network.
- **Quality:** music plays in original quality unless you set a limit in
  *Settings*; video is converted by the server only when your device cannot play
  the file or when you pick a lower quality in the player.
- **Seek-bar previews on Plex** require the server option *Generate video preview
  thumbnails*.

## For developers

Build instructions, server compatibility notes and the architecture are in
[docs/development.md](docs/development.md).

## License

MIT

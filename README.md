# Whispo

AI-powered dictation tool.

This is [Trent Millar](https://github.com/trentmillar)’s maintained version of Whispo, based on the original project by [EGOIST](https://github.com/egoist/whispo).

## Build / Run

 You need to install Rust and Cargo first. The app has a Rust component
  (whispo-rs) that handles keyboard events. To fix this:

  1. Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs
  | sh
  2. Run ./scripts/build-rs.sh to build the binary
  3. Then run your Electron app

## Download

Currently building for macOS (Apple Silicon).

[Releases](https://github.com/trentmillar/whispo/releases/latest)

### macOS: “app is damaged” / can’t be opened

Release builds are **not code-signed or notarized**. Gatekeeper may say the app is damaged or was moved to Trash — that is a quarantine warning, not a corrupt download.

**Fix after downloading the `.dmg` / `.zip`:**

1. Open **Terminal**.
2. Clear the quarantine flag (adjust the path if you put the app somewhere else):

```bash
sudo xattr -cr /Applications/Whispo.app
```

If it is still in Downloads / the mounted DMG:

```bash
xattr -cr ~/Downloads/Whispo*.dmg
# or, after dragging Whispo.app out of the DMG:
xattr -cr /path/to/Whispo.app
```

3. Open **Whispo.app** again (double-click, or right-click → **Open**).

Alternative without Terminal: **System Settings → Privacy & Security**, scroll to the blocked-app message, and choose **Open Anyway** when macOS offers it.

## Preview


https://github.com/user-attachments/assets/2344a817-f36c-42b0-9ebc-cdd6e926b7a0


## Features

- Hold `Ctrl` key to record your voice, release to transcribe it.
- Automatically insert the transcript into the application you are using.
- Works with any application that supports text input.
- Data is stored locally on your machine.
- Transcrbing with OpenAI Whisper (provided by OpenAI or Groq).
- Support custom API URL so you can use your own API to transcribe.
- Supports post-processing your transcript with LLMs (e.g. OpenAI, Groq and Gemini).

## License

[AGPL-3.0](./LICENSE)

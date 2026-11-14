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

Currently building for macOS (Apple Silicon) and Windows x64.

[Releases](https://github.com/trentmillar/whispo/releases/latest)

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

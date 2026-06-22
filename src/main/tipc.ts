import fs from "fs"
import { execFile } from "node:child_process"
import { getRendererHandlers, tipc } from "@egoist/tipc/main"
import { showPanelWindow, WINDOWS, showOverlayWindow } from "./window"
import {
  app,
  clipboard,
  Menu,
  shell,
  systemPreferences,
  dialog,
} from "electron"
import path from "path"
import { promisify } from "node:util"
import { configStore, recordingsFolder } from "./config"
import { Config, RecordingHistoryItem } from "../shared/types"
import { RendererHandlers } from "./renderer-handlers"
import { analyzeSpeechDeliveryInsight } from "./delivery-insight"
import { postProcessTranscript } from "./llm"
import { state } from "./state"
import { updateTrayIcon } from "./tray"
import { isAccessibilityGranted } from "./utils"

const t = tipc.create()
const STT_MAX_UPLOAD_BYTES = 24 * 1024 * 1024
const STT_SEGMENT_SECONDS = 8 * 60
const STT_SEGMENT_MIME_TYPE = "audio/webm"
const execFileAsync = promisify(execFile)

const formatMegabytes = (bytes: number) => {
  return (bytes / (1024 * 1024)).toFixed(1)
}

const getSttTooLargeMessage = (actualBytes: number) => {
  return `Audio file is too large (${formatMegabytes(actualBytes)} MB). Please use a file smaller than ${formatMegabytes(STT_MAX_UPLOAD_BYTES)} MB or split/compress it before uploading.`
}

const getSttChunkingFailedMessage = () => {
  return "Audio file is too large and could not be chunked automatically. Please install ffmpeg or split/compress the file and try again."
}

const toArrayBuffer = (buffer: Buffer) => {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
}

const splitAudioIntoTranscribableChunks = async ({
  recording,
  fileName,
}: {
  recording: ArrayBuffer
  fileName: string
}) => {
  const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "whispo-stt-"))
  const inputExtension = path.extname(fileName || "").trim() || ".audio"
  const inputPath = path.join(tempDir, `upload${inputExtension}`)
  const chunkPattern = path.join(tempDir, "chunk-%03d.webm")

  try {
    fs.writeFileSync(inputPath, Buffer.from(recording))

    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-c:a",
      "libopus",
      "-b:a",
      "24k",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "segment",
      "-segment_time",
      `${STT_SEGMENT_SECONDS}`,
      "-reset_timestamps",
      "1",
      chunkPattern,
    ])
  } catch {
    throw new Error(getSttChunkingFailedMessage())
  }

  try {
    const chunkFiles = fs
      .readdirSync(tempDir)
      .filter((name) => name.startsWith("chunk-") && name.endsWith(".webm"))
      .sort((a, b) => a.localeCompare(b))

    if (chunkFiles.length === 0) {
      throw new Error(getSttChunkingFailedMessage())
    }

    return chunkFiles.map((chunkFile) => {
      const chunkBuffer = fs.readFileSync(path.join(tempDir, chunkFile))
      return {
        recording: toArrayBuffer(chunkBuffer),
        fileName: chunkFile,
        mimeType: STT_SEGMENT_MIME_TYPE,
      }
    })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

const getRecordingHistory = () => {
  try {
    const history = JSON.parse(
      fs.readFileSync(path.join(recordingsFolder, "history.json"), "utf8"),
    ) as RecordingHistoryItem[]

    // sort desc by createdAt
    return history.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

const saveRecordingsHitory = (history: RecordingHistoryItem[]) => {
  fs.writeFileSync(
    path.join(recordingsFolder, "history.json"),
    JSON.stringify(history),
  )
}

const requestTranscriptFromStt = async ({
  recording,
  mimeType,
  fileName,
}: {
  recording: ArrayBuffer
  mimeType: string
  fileName: string
}) => {
  if (recording.byteLength > STT_MAX_UPLOAD_BYTES) {
    throw new Error(getSttTooLargeMessage(recording.byteLength))
  }

  // Reload config to ensure we have the latest provider and API key.
  const config = configStore.reload()

  const form = new FormData()
  const blob = new Blob([recording], { type: mimeType })
  form.append("file", blob, fileName)
  form.append(
    "model",
    config.sttProviderId === "groq" ? "whisper-large-v3-turbo" : "whisper-1",
  )
  form.append("response_format", "json")

  const groqBaseUrl = config.groqBaseUrl || "https://api.groq.com/openai/v1"
  const openaiBaseUrl = config.openaiBaseUrl || "https://api.openai.com/v1"

  const apiKey =
    config.sttProviderId === "groq" ? config.groqApiKey : config.openaiApiKey
  const apiUrl =
    config.sttProviderId === "groq"
      ? `${groqBaseUrl}/audio/transcriptions`
      : `${openaiBaseUrl}/audio/transcriptions`

  const transcriptResponse = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!transcriptResponse.ok) {
    const errorText = await transcriptResponse.text()
    const providerRejectedAsTooLarge =
      transcriptResponse.status === 413 ||
      errorText.includes("request_too_large") ||
      errorText.includes("Request Entity Too Large")
    if (providerRejectedAsTooLarge) {
      throw new Error(getSttTooLargeMessage(recording.byteLength))
    }
    const message = `${transcriptResponse.statusText} ${errorText.slice(0, 300)}`
    throw new Error(message)
  }

  const json: { text: string } = await transcriptResponse.json()
  return json.text
}

export const router = {
  restartApp: t.procedure.action(async () => {
    app.relaunch()
    app.quit()
  }),

  getUpdateInfo: t.procedure.action(async () => {
    const { getUpdateInfo } = await import("./updater")
    return getUpdateInfo()
  }),

  quitAndInstall: t.procedure.action(async () => {
    const { quitAndInstall } = await import("./updater")

    quitAndInstall()
  }),

  checkForUpdatesAndDownload: t.procedure.action(async () => {
    const { checkForUpdatesAndDownload } = await import("./updater")

    return checkForUpdatesAndDownload()
  }),

  openMicrophoneInSystemPreferences: t.procedure.action(async () => {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    )
  }),

  hidePanelWindow: t.procedure.action(async () => {
    const panel = WINDOWS.get("panel")

    panel?.hide()
  }),

  showContextMenu: t.procedure
    .input<{ x: number; y: number; selectedText?: string }>()
    .action(async ({ input, context }) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      if (input.selectedText) {
        items.push({
          label: "Copy",
          click() {
            clipboard.writeText(input.selectedText || "")
          },
        })
      }

      if (import.meta.env.DEV) {
        items.push({
          label: "Inspect Element",
          click() {
            context.sender.inspectElement(input.x, input.y)
          },
        })
      }

      const panelWindow = WINDOWS.get("panel")
      const isPanelWindow = panelWindow?.webContents.id === context.sender.id

      if (isPanelWindow) {
        items.push({
          label: "Close",
          click() {
            panelWindow?.hide()
          },
        })
      }

      const menu = Menu.buildFromTemplate(items)
      menu.popup({
        x: input.x,
        y: input.y,
      })
    }),

  getMicrophoneStatus: t.procedure.action(async () => {
    return systemPreferences.getMediaAccessStatus("microphone")
  }),

  isAccessibilityGranted: t.procedure.action(async () => {
    return isAccessibilityGranted()
  }),

  requestAccesssbilityAccess: t.procedure.action(async () => {
    if (process.platform === "win32") return true

    return systemPreferences.isTrustedAccessibilityClient(true)
  }),

  requestMicrophoneAccess: t.procedure.action(async () => {
    return systemPreferences.askForMediaAccess("microphone")
  }),

  showPanelWindow: t.procedure.action(async () => {
    showPanelWindow()
  }),

  displayError: t.procedure
    .input<{ title?: string; message: string }>()
    .action(async ({ input }) => {
      dialog.showErrorBox(input.title || "Error", input.message)
    }),

  createRecording: t.procedure
    .input<{
      recording: ArrayBuffer
      duration: number
    }>()
    .action(async ({ input }) => {
      fs.mkdirSync(recordingsFolder, { recursive: true })
      const originalTranscript = await requestTranscriptFromStt({
        recording: input.recording,
        mimeType: "audio/webm",
        fileName: "recording.webm",
      })
      const [aiResponse, speechDelivery] = await Promise.all([
        postProcessTranscript(originalTranscript),
        analyzeSpeechDeliveryInsight(originalTranscript, input.duration),
      ])

      const history = getRecordingHistory()
      const item: RecordingHistoryItem = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        duration: input.duration,
        transcript: originalTranscript,
        aiResponse: aiResponse !== originalTranscript ? aiResponse : undefined,
      }
      history.push(item)
      saveRecordingsHitory(history)

      fs.writeFileSync(
        path.join(recordingsFolder, `${item.id}.webm`),
        Buffer.from(input.recording),
      )

      const main = WINDOWS.get("main")
      if (main) {
        getRendererHandlers<RendererHandlers>(
          main.webContents,
        ).refreshRecordingHistory.send()
      }

      // Hide panel window
      const panel = WINDOWS.get("panel")
      if (panel) {
        panel.hide()
      }

      const hasDistinctAi =
        Boolean(aiResponse) && aiResponse !== originalTranscript
      const hasDelivery = Boolean(speechDelivery?.trim())
      if (hasDistinctAi || hasDelivery) {
        showOverlayWindow({
          question: originalTranscript,
          response: hasDistinctAi ? aiResponse : "",
          speechDelivery: hasDelivery ? speechDelivery : undefined,
        })
      }
    }),

  transcribeUploadedAudio: t.procedure
    .input<{
      audio: ArrayBuffer
      mimeType?: string
      fileName?: string
    }>()
    .action(async ({ input }) => {
      const mimeType = input.mimeType || "audio/webm"
      const fileName = input.fileName || "upload.webm"
      const isLargeUpload = input.audio.byteLength > STT_MAX_UPLOAD_BYTES

      const transcript = isLargeUpload
        ? (
            await (async () => {
              const chunks = await splitAudioIntoTranscribableChunks({
                recording: input.audio,
                fileName,
              })
              const parts: string[] = []
              for (const chunk of chunks) {
                parts.push(
                  await requestTranscriptFromStt({
                    recording: chunk.recording,
                    mimeType: chunk.mimeType,
                    fileName: chunk.fileName,
                  }),
                )
              }
              return parts
            })()
          )
            .map((part) => part.trim())
            .filter(Boolean)
            .join(" ")
        : await requestTranscriptFromStt({
            recording: input.audio,
            mimeType,
            fileName,
          })

      return { transcript }
    }),

  getRecordingHistory: t.procedure.action(async () => getRecordingHistory()),

  deleteRecordingItem: t.procedure
    .input<{ id: string }>()
    .action(async ({ input }) => {
      const recordings = getRecordingHistory().filter(
        (item) => item.id !== input.id,
      )
      saveRecordingsHitory(recordings)
      fs.unlinkSync(path.join(recordingsFolder, `${input.id}.webm`))
    }),

  deleteRecordingHistory: t.procedure.action(async () => {
    fs.rmSync(recordingsFolder, { force: true, recursive: true })
  }),

  getConfig: t.procedure.action(async () => {
    return configStore.get()
  }),

  saveConfig: t.procedure
    .input<{ config: Config }>()
    .action(async ({ input }) => {
      configStore.save(input.config)
    }),

  recordEvent: t.procedure
    .input<{ type: "start" | "end" }>()
    .action(async ({ input }) => {
      if (input.type === "start") {
        state.isRecording = true
      } else {
        state.isRecording = false
      }
      updateTrayIcon()
    }),

  confirmTranscript: t.procedure
    .input<{ transcript: string }>()
    .action(async () => {
      const overlay = WINDOWS.get("overlay")
      if (overlay) {
        overlay.hide()
      }
    }),

  showAiResponse: t.procedure
    .input<{
      question: string
      response: string
      speechDelivery?: string
    }>()
    .action(async ({ input }) => {
      showOverlayWindow({
        question: input.question,
        response: input.response,
        speechDelivery: input.speechDelivery,
      })
    }),
}

export type Router = typeof router

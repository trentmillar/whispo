import fs from "fs"
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
import { configStore, recordingsFolder } from "./config"
import { Config, RecordingHistoryItem } from "../shared/types"
import { RendererHandlers } from "./renderer-handlers"
import { postProcessTranscript } from "./llm"
import { state } from "./state"
import { updateTrayIcon } from "./tray"
import { isAccessibilityGranted } from "./utils"
import { writeText } from "./keyboard"

const t = tipc.create()

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

      // Reload config to ensure we have the latest
      const config = configStore.reload()
      console.log("STT Config:", {
        sttProviderId: config.sttProviderId,
        hasGroqKey: !!config.groqApiKey,
        hasOpenaiKey: !!config.openaiApiKey
      })
      
      const form = new FormData()
      const blob = new Blob([input.recording], { type: "audio/webm" })
      form.append(
        "file",
        blob,
        "recording.webm"
      )
      form.append(
        "model",
        config.sttProviderId === "groq" ? "whisper-large-v3" : "whisper-1",
      )
      form.append("response_format", "json")
      
      console.log("Form data:", {
        fileSize: blob.size,
        fileType: blob.type,
        model: config.sttProviderId === "groq" ? "whisper-large-v3" : "whisper-1"
      })

      const groqBaseUrl = config.groqBaseUrl || "https://api.groq.com/openai/v1"
      const openaiBaseUrl = config.openaiBaseUrl || "https://api.openai.com/v1"

      const apiKey = config.sttProviderId === "groq" ? config.groqApiKey : config.openaiApiKey
      const apiUrl = config.sttProviderId === "groq"
        ? `${groqBaseUrl}/audio/transcriptions`
        : `${openaiBaseUrl}/audio/transcriptions`
        
      console.log("Using STT API:", {
        url: apiUrl,
        provider: config.sttProviderId,
        keyLength: apiKey?.length || 0,
        keyPrefix: apiKey?.substring(0, 10) + "..."
      })

      const transcriptResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      })

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text()
        console.log("Full error response:", errorText)
        console.log("Response headers:", Object.fromEntries(transcriptResponse.headers.entries()))
        const message = `${transcriptResponse.statusText} ${errorText.slice(0, 300)}`

        throw new Error(message)
      }

      const json: { text: string } = await transcriptResponse.json()
      const originalTranscript = json.text
      const aiResponse = await postProcessTranscript(originalTranscript)

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

      // Copy and paste the original transcript (not the AI response)
      clipboard.writeText(originalTranscript)
      if (isAccessibilityGranted()) {
        await writeText(originalTranscript)
      }

      // If there's an AI response, show the overlay automatically
      if (aiResponse && aiResponse !== originalTranscript) {
        showOverlayWindow({
          question: originalTranscript,
          response: aiResponse
        })
      }
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
    .action(async ({ input }) => {
      const overlay = WINDOWS.get("overlay")
      if (overlay) {
        overlay.hide()
      }

      // paste
      clipboard.writeText(input.transcript)
      if (isAccessibilityGranted()) {
        await writeText(input.transcript)
      }
    }),

  showAiResponse: t.procedure
    .input<{ question: string; response: string }>()
    .action(async ({ input }) => {
      showOverlayWindow({
        question: input.question,
        response: input.response
      })
    }),
}

export type Router = typeof router

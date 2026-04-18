import { Button } from "@renderer/components/ui/button"
import { Spinner } from "@renderer/components/ui/spinner"
import { Textarea } from "@renderer/components/ui/textarea"
import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { tipcClient } from "~/lib/tipc-client"

const ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
]

export function Component() {
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const transcribeMutation = useMutation({
    mutationFn: async (audioFile: File) => {
      return tipcClient.transcribeUploadedAudio({
        audio: await audioFile.arrayBuffer(),
        mimeType: audioFile.type || undefined,
        fileName: audioFile.name || undefined,
      })
    },
    onSuccess(data) {
      setTranscript(data.transcript)
      setErrorMessage("")
    },
    onError(error) {
      setErrorMessage(error.message)
    },
  })

  const isSupportedAudio = useMemo(() => {
    if (!file) return true
    if (!file.type) return true
    return ACCEPTED_AUDIO_MIME_TYPES.includes(file.type)
  }, [file])

  return (
    <div className="flex h-full flex-col">
      <header className="app-drag-region flex h-12 shrink-0 items-center border-b px-4 text-sm font-bold">
        Upload & Transcribe
      </header>

      <div className="grid grow gap-4 p-6">
        <div className="grid gap-2">
          <label className="text-sm font-medium">Audio file</label>
          <input
            type="file"
            accept="audio/*"
            className="text-sm"
            onChange={(e) => {
              setTranscript("")
              setErrorMessage("")
              setFile(e.target.files?.[0] || null)
            }}
          />
          <p className="text-xs text-muted-foreground">
            Select a local audio file and send it to your configured speech to
            text provider.
          </p>
        </div>

        {!isSupportedAudio && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            This file type may not be supported. Try wav, mp3, m4a, webm, or
            ogg.
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={!file || transcribeMutation.isPending}
            onClick={() => {
              if (!file) return
              transcribeMutation.mutate(file)
            }}
          >
            {transcribeMutation.isPending ? (
              <>
                <Spinner className="scale-75" />
                <span>Transcribing...</span>
              </>
            ) : (
              "Transcribe file"
            )}
          </Button>

          {file && (
            <span className="text-xs text-muted-foreground">
              {file.name}
            </span>
          )}
        </div>

        {errorMessage && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Transcript</label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!transcript}
              onClick={async () => {
                await navigator.clipboard.writeText(transcript)
              }}
            >
              Copy
            </Button>
          </div>
          <Textarea
            value={transcript}
            readOnly
            placeholder="Your transcript will appear here."
            className="min-h-[280px]"
          />
        </div>
      </div>
    </div>
  )
}

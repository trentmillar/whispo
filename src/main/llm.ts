import { dialog } from "electron"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"

export async function postProcessTranscript(transcript: string) {
  const config = configStore.get()


  if (!config.transcriptPostProcessingEnabled) {
    console.log("Post-processing disabled, returning original transcript")
    return transcript
  }

  // Use default prompt if none is set
  const defaultPrompt = "Answer the following question: {transcript}"
  const promptToUse = config.transcriptPostProcessingPrompt || defaultPrompt

  const prompt = promptToUse.replace(
    "{transcript}",
    transcript,
  )

  const chatProviderId = config.transcriptPostProcessingProviderId

  if (chatProviderId === "gemini") {
    if (!config.geminiApiKey) throw new Error("Gemini API key is required")

    const gai = new GoogleGenerativeAI(config.geminiApiKey)
    const gModel = gai.getGenerativeModel({ model: "gemini-1.5-flash-002" })

    const result = await gModel.generateContent([prompt], {
      baseUrl: config.geminiBaseUrl,
    })
    return result.response.text().trim()
  }

  const chatBaseUrl =
    chatProviderId === "groq"
      ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
      : config.openaiBaseUrl || "https://api.openai.com/v1"

  const apiKey = chatProviderId === "groq" ? config.groqApiKey : config.openaiApiKey
  const model = chatProviderId === "groq" ? "llama-3.1-8b-instant" : "gpt-4o-mini"
  const chatUrl = `${chatBaseUrl}/chat/completions`
  

  const chatResponse = await fetch(chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      temperature: 0,
      model,
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    }),
  })

  if (!chatResponse.ok) {
    const message = `${chatResponse.statusText} ${(await chatResponse.text()).slice(0, 300)}`

    throw new Error(message)
  }

  const chatJson = await chatResponse.json()
  console.log(chatJson)
  return chatJson.choices[0].message.content.trim()
}

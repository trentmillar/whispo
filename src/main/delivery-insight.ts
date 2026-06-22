import { GoogleGenerativeAI } from "@google/generative-ai"
import { configStore } from "./config"

/**
 * Uses transcript + duration-based WPM to infer delivery style.
 * Does not observe audience or room audio — wording and pace only.
 */
export async function analyzeSpeechDeliveryInsight(
  transcript: string,
  durationMs: number,
): Promise<string | undefined> {
  const trimmed = transcript.trim()
  if (!trimmed) return undefined

  const config = configStore.get()
  const words = trimmed.split(/\s+/).filter(Boolean).length
  const durationSec = Math.max(durationMs / 1000, 0.5)
  const wpm = words / (durationSec / 60)

  const provider =
    config.transcriptPostProcessingProviderId ||
    (config.geminiApiKey
      ? "gemini"
      : config.groqApiKey
        ? "groq"
        : config.openaiApiKey
          ? "openai"
          : null)

  if (!provider) return undefined

  const userBlock = `Transcript (what the speaker said):
"""
${trimmed}
"""

Metrics: ${words} words in ${durationSec.toFixed(1)}s → about ${wpm.toFixed(0)} words/minute.`

  const instruction = `You are a brief speaking coach. You only have text and approximate pace — you cannot see, hear, or measure the audience.

Write a compact analysis (under 200 words) using this structure with markdown headings:

## Delivery read
2–3 sentences: overall impression (e.g. engaging, flat, confrontational, inspirational, professional, rambling — only as hypotheses from the words).

## Pace
Say whether ${wpm.toFixed(0)} wpm over this clip is likely too fast, comfortable, or slow for most listeners, and one tip if pace is an issue.

## Audience / engagement
You cannot know if the audience is engaged. Infer only from the transcript (questions, structure, jargon, monologue risk) and state clearly that this is an inference, not observation.

## One tweak
One concrete improvement for the next take.

Be direct and useful. If the transcript is too short to judge, say so briefly.`

  try {
    if (provider === "gemini") {
      if (!config.geminiApiKey) return undefined
      const gai = new GoogleGenerativeAI(config.geminiApiKey)
      const model = gai.getGenerativeModel({ model: "gemini-1.5-flash-002" })
      const result = await model.generateContent(
        `${instruction}\n\n${userBlock}`,
        { baseUrl: config.geminiBaseUrl },
      )
      const text = result.response.text().trim()
      return text || undefined
    }

    const chatBaseUrl =
      provider === "groq"
        ? config.groqBaseUrl || "https://api.groq.com/openai/v1"
        : config.openaiBaseUrl || "https://api.openai.com/v1"
    const apiKey =
      provider === "groq" ? config.groqApiKey : config.openaiApiKey
    if (!apiKey) return undefined

    const model =
      provider === "groq" ? "llama-3.1-8b-instant" : "gpt-4o-mini"
    const chatUrl = `${chatBaseUrl}/chat/completions`

    const chatResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        temperature: 0.3,
        model,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: userBlock },
        ],
      }),
    })

    if (!chatResponse.ok) {
      console.warn(
        "delivery-insight:",
        chatResponse.status,
        await chatResponse.text(),
      )
      return undefined
    }

    const chatJson = (await chatResponse.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = chatJson.choices?.[0]?.message?.content?.trim()
    return text || undefined
  } catch (e) {
    console.warn("analyzeSpeechDeliveryInsight", e)
    return undefined
  }
}

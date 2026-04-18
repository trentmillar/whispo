import { app } from "electron"
import path from "path"
import fs from "fs"
import { Config } from "@shared/types"

export const dataFolder = path.join(app.getPath("appData"), process.env.APP_ID)

export const recordingsFolder = path.join(dataFolder, "recordings")

export const configPath = path.join(dataFolder, "config.json")

const getConfig = () => {
  try {
    console.log("Reading config from path:", configPath)
    const configContent = fs.readFileSync(configPath, "utf8")
    console.log("Raw config content:", configContent)
    const config = JSON.parse(configContent) as Config
    console.log("Parsed config:", config)
    console.log("Config groqApiKey length:", config.groqApiKey?.length)
    return config
  } catch (error) {
    console.log("Failed to load config:", error)
    return {}
  }
}

class ConfigStore {
  config: Config | undefined

  constructor() {
    this.config = getConfig()
  }

  get() {
    return this.config || {}
  }

  reload() {
    console.log("ConfigStore.reload() called")
    console.log("Current in-memory config before reload:", this.config)
    this.config = getConfig()
    console.log("New in-memory config after reload:", this.config)
    return this.config
  }

  save(config: Config) {
    console.log("ConfigStore.save() called with:", JSON.stringify(config, null, 2))
    console.log("groqApiKey type:", typeof config.groqApiKey)
    console.log("groqApiKey length:", config.groqApiKey?.length)
    this.config = config
    fs.mkdirSync(dataFolder, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config))
    console.log("Config saved to:", configPath)
    console.log("Saved config:", config)
  }
}

export const configStore = new ConfigStore()

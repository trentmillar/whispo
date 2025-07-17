import { app } from "electron"
import path from "path"
import fs from "fs"
import { Config } from "@shared/types"

export const dataFolder = path.join(app.getPath("appData"), process.env.APP_ID)

export const recordingsFolder = path.join(dataFolder, "recordings")

export const configPath = path.join(dataFolder, "config.json")

const getConfig = () => {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Config
    console.log("Loaded config from disk:", config)
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
    this.config = getConfig()
    return this.config
  }

  save(config: Config) {
    this.config = config
    fs.mkdirSync(dataFolder, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config))
    console.log("Config saved:", config)
  }
}

export const configStore = new ConfigStore()

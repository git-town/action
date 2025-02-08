import * as fs from 'node:fs'
import * as core from '@actions/core'
import * as toml from 'toml'
import * as z from 'zod'

const { object, array, string } = z

const configSchema = object({
  branches: object({
    main: string().optional(),
    perennials: array(string()).optional(),
    'perennial-regex': string().optional(),
  }).optional(),
})

export type Config = z.infer<typeof configSchema>

const CONFIG_FILE_NAMES = ['.git-branches.toml', '.git-town.toml']
let configFile: string | undefined

CONFIG_FILE_NAMES.forEach((file) => {
  try {
    configFile ??= fs.readFileSync(file).toString()
  } catch {
    configFile = undefined
  }
})

const parsed = configSchema.safeParse(toml.parse(configFile ?? ''))

if (!parsed.success) {
  core.warning(
    'Failed to parse Git Town config. If this is a mistake, ensure that `.git-branches.toml`/`.git-town.toml` is valid.'
  )
}

const config: Config | undefined = configFile && parsed.success ? parsed.data : undefined

core.startGroup('Config')
core.info(JSON.stringify(config))
core.endGroup()

export { config }

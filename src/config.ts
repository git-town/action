import * as fs from 'node:fs'
import * as core from '@actions/core'
import * as toml from 'toml'
import * as z from 'zod'

const { object, array, string } = z

const configSchema = object({
  branches: object({
    main: string().optional(),
    perennials: array(string()).optional(),
    perennialRegex: string().optional(),
  }).optional(),
})

export type Config = z.infer<typeof configSchema>

let configFile

try {
  configFile = fs.readFileSync('.git-branches.toml').toString()
} catch {
  configFile = undefined
}

const parsed = configSchema.safeParse(toml.parse(configFile ?? ''))

if (!parsed.success) {
  core.warning(
    'Failed to parse Git Town config. If this is a mistake, ensure that `.git-branches.toml` is valid.'
  )
}

const config: Config | undefined = configFile && parsed.success ? parsed.data : undefined

export { config }

import { spawn } from 'node:child_process'

const ALLOWED_COMMANDS = new Set([
  'brew',
  'docker',
  'du',
  'find',
  'mv',
  'pnpm',
  'which'
])

export interface CommandResult {
  command: string
  args: string[]
  code: number
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export async function runCommand(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string
    timeoutMs?: number
    allowFailure?: boolean
    maxBuffer?: number
  } = {}
) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Command not allowed: ${command}`)
  }

  const {
    cwd,
    timeoutMs = 30_000,
    allowFailure = false,
    maxBuffer = 4 * 1024 * 1024
  } = options

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}`))
    }, timeoutMs)

    const finalize = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()

      if (stdout.length > maxBuffer) {
        child.kill('SIGTERM')
        finalize(() => reject(new Error(`Command exceeded output limit: ${command}`)))
      }
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()

      if (stderr.length > maxBuffer) {
        child.kill('SIGTERM')
        finalize(() => reject(new Error(`Command exceeded error output limit: ${command}`)))
      }
    })

    child.on('error', (error) => {
      finalize(() => reject(error))
    })

    child.on('close', (code, signal) => {
      const result: CommandResult = {
        command,
        args,
        code: code ?? -1,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      }

      if ((code ?? -1) === 0 || allowFailure) {
        finalize(() => resolve(result))
        return
      }

      finalize(() => reject(new Error(result.stderr || `Command failed: ${command}`)))
    })
  })
}

export async function commandExists(command: string) {
  const result = await runCommand('which', [command], {
    allowFailure: true,
    timeoutMs: 4000
  })

  return result.code === 0
}

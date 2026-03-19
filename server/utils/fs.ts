import { access, constants, mkdir, rename } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { runCommand } from './command'

export async function getPathSize(targetPath: string) {
  const result = await runCommand('du', ['-sk', targetPath], {
    allowFailure: true,
    timeoutMs: 20_000
  })

  if (result.code !== 0 || !result.stdout) return 0

  const [sizeToken] = result.stdout.split(/\s+/)
  const size = Number.parseInt(sizeToken ?? '', 10)
  return Number.isFinite(size) ? size * 1024 : 0
}

export async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function moveToTrash(targetPath: string) {
  const trashDir = join(homedir(), '.Trash')
  await mkdir(trashDir, { recursive: true })

  const ext = extname(targetPath)
  const stem = basename(targetPath, ext)
  const destination = join(trashDir, `${stem}-${Date.now()}${ext}`)

  try {
    await rename(targetPath, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error
    }

    await runCommand('mv', [targetPath, destination], { timeoutMs: 30_000 })
  }

  return destination
}

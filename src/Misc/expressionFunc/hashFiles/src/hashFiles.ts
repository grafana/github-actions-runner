import * as crypto from 'crypto'
import * as fs from 'fs'
import * as glob from '@actions/glob'
import * as path from 'path'
import * as stream from 'stream'
import * as util from 'util'
import pLimit from 'p-limit'

// This limit is a bit empiric.

/**
 * This concurrency setting is a bit empiric.
 * Below some results on my M1 (tested on >150k samll files):
 *  | concurrency | difference |
 *  | ----------- | ---------- |
 *  |           1 |        16% |
 *  |           2 |        45% |
 *  |           3 |        55% |
 *  |           5 |        58% |
 *  |          10 |        60% |
 *  |          20 |        60% |
 *
 * Anything above ~10 doesn't seem to yield any significant improvement
 */

const limit = pLimit(10)

async function run(): Promise<void> {
  // arg0 -> node
  // arg1 -> hashFiles.js
  // env[followSymbolicLinks] = true/null
  // env[patterns] -> glob patterns
  let followSymbolicLinks = false
  const matchPatterns = process.env.patterns || ''
  if (process.env.followSymbolicLinks === 'true') {
    console.log('Follow symbolic links')
    followSymbolicLinks = true
  }

  console.log(`Match Pattern: ${matchPatterns}`)
  const githubWorkspace = process.cwd()
  const result = crypto.createHash('sha256')
  const globber = await glob.create(matchPatterns, {followSymbolicLinks})
  const pipeline = util.promisify(stream.pipeline)
  let filePromises = []

  for await (const file of globber.globGenerator()) {
    filePromises.push(
      limit(async () => {
        console.log(file)
        if (!file.startsWith(`${githubWorkspace}${path.sep}`)) {
          console.log(
            `Ignore '${file}' since it is not under GITHUB_WORKSPACE.`
          )
          return
        }
        if (fs.statSync(file).isDirectory()) {
          console.log(`Skip directory '${file}'.`)
          return
        }

        const hash = crypto.createHash('sha256')
        await pipeline(fs.createReadStream(file), hash)
        return hash.digest()
      })
    )
  }

  const executedFilePromises = (await Promise.all(filePromises)).filter(Boolean)

  executedFilePromises.forEach(digest => {
    result.write(digest)
  })

  result.end()

  if (executedFilePromises.length) {
    console.log(`Found ${executedFilePromises.length} files to hash.`)
    console.error(`__OUTPUT__${result.digest('hex')}__OUTPUT__`)
  } else {
    console.error(`__OUTPUT____OUTPUT__`)
  }
}

;(async () => {
  try {
    const out = await run()
    console.log(out)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()

import {describe, it} from 'node:test'
import child_process from 'node:child_process'
import assert from 'node:assert'

const env = {env: {...process.env, patterns: './src/**/*'}}

const spawn = (path: string): Promise<{hash: string; duration: number}> => {
  return new Promise(resolve => {
    let hash = ''
    const start = performance.now()
    const process = child_process.spawn('node_modules/.bin/tsx', [path], env)

    process.stderr.on('data', data => {
      hash += data
    })

    process.on('close', () => {
      resolve({hash, duration: performance.now() - start})
    })
  })
}

describe('Updated script', () => {
  it('Yelds the same outout as the original script', async () => {
    const {hash: originalHash, duration: originalDuration} = await spawn(
      './src/tests/original.ts'
    )
    const {hash: updatedHash, duration: updatedDuration} =
      await spawn('./src/hashFiles.ts')

    const perc = ((originalDuration - updatedDuration) / originalDuration) * 100
    console.log(`Percentage Difference: ${perc.toFixed(2)}%`)

    assert.strictEqual(originalHash, updatedHash)
    assert(originalDuration > updatedDuration)
  })
})

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))

// No Wrangler configuration is loaded: these bindings are isolated, temporary,
// local workerd resources, never the production D1 database or R2 bucket.
export async function createTestRuntime({ seedSettings = true, ...options } = {}) {
  const bundle = await build({
    absWorkingDir: projectRoot,
    entryPoints: ['worker/preview-wrapper.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    script: bundle.outputFiles[0].text,
    modules: true,
    compatibilityDate: '2026-08-31',
    d1Databases: ['margo_glenn_wedding_db'],
    r2Buckets: ['WEDDING_PHOTOS'],
    cf: false,
    log: new Log(LogLevel.ERROR),
    ...options,
    bindings: { ALLOW_TEST_INVITATIONS: 'true', ...options.bindings },
  }))
  try {
    const db = await runtime.getD1Database('margo_glenn_wedding_db')
    const bucket = await runtime.getR2Bucket('WEDDING_PHOTOS')
    const migrationDirectory = new URL('../migrations/', import.meta.url)
    for (const filename of (await readdir(migrationDirectory)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(filename, migrationDirectory), 'utf8')
      // These migrations contain ordinary statements, with no trigger bodies.
      const statements = sql.replace(/--[^\r\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)
      for (const statement of statements) await db.prepare(statement).run()
    }
    if (seedSettings) {
      // Deliberately test-only dates; production settings are never changed.
      await db.prepare(`INSERT OR REPLACE INTO wedding_settings
        (id, rsvp_deadline, rsvp_change_deadline)
        VALUES (1, '2099-08-01T00:00:00Z', '2099-09-01T00:00:00Z')`).run()
    }
    return { runtime, db, bucket }
  } catch (error) {
    await runtime.dispose()
    throw error
  }
}

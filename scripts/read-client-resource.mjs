#!/usr/bin/env node
/** Read one same-origin plugin resource from current or legacy DSH boot HTML. */
import { readFile } from 'node:fs/promises'

const [htmlPath, id = 'dsh-liangxiang'] = process.argv.slice(2)
const html = await readFile(htmlPath, 'utf8')
const graphJson = html.match(/globalThis\["__DSH_BOOT__"\]\s*=\s*([^<]+)<\/script>/)?.[1]
const graph = graphJson === undefined ? undefined : JSON.parse(graphJson.replace(/;\s*$/, ''))
const entry = graph?.entries?.find(row => row.id === id)
const attrs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
const reference = entry?.url ?? attrs.find(value => value.includes('/plugins/??') && value.includes(`${id}/client.js`))
const resource = typeof reference === 'string' && /^(?:\.\/)?plugins\//.test(reference)
  ? '/' + reference.replace(/^\.\//, '') : reference
if (typeof resource !== 'string' || !resource.startsWith('/plugins/')) {
  throw new Error(`DSH boot HTML does not expose a same-origin client resource for ${id}`)
}
process.stdout.write(resource)

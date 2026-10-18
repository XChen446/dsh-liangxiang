#!/usr/bin/env node
/** Apply audited build decisions to one isolated Profile, preserving other settings. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// YAML is already a direct dependency of the pinned DSH CLI.
const require = createRequire(import.meta.url)
const dshRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
const { parseDocument } = dshRequire('yaml')

const [profileWorkspacePath, policyPath] = process.argv.slice(2)
if (profileWorkspacePath === undefined || policyPath === undefined) {
  console.error('usage: node scripts/prepare-smoke-profile-policy.mjs <profile-workspace> <policy>')
  process.exit(2)
}

const [workspace, policy] = await Promise.all([
  readFile(profileWorkspacePath, 'utf8'),
  readFile(policyPath, 'utf8'),
])
const policyDocument = parseDocument(policy)
const workspaceDocument = parseDocument(workspace)
if (policyDocument.errors.length || workspaceDocument.errors.length) throw new Error('invalid Profile/build-policy YAML')
const decisions = policyDocument.toJS()
if (Object.keys(decisions).length !== 1 || !decisions.allowBuilds
  || Object.values(decisions.allowBuilds).some(value => typeof value !== 'boolean')) {
  throw new Error(`${policyPath} must contain only the audited allowBuilds policy`)
}
for (const [name, allowed] of Object.entries(decisions.allowBuilds)) {
  workspaceDocument.setIn(['allowBuilds', name], allowed)
}
await writeFile(profileWorkspacePath, workspaceDocument.toString(), 'utf8')

#!/usr/bin/env node

const {build} = require('esbuild')

const common = {
  bundle: true,
  entryPoints: ['lib/main.ts'],
  sourcemap: 'external'
}

build({
    ...common,
    outfile: 'dist/paravel.esm.js',
    format: 'esm',
    packages: 'external'
  })
  .then(() => console.log('esm build success.'))

build({
    ...common,
    outfile: 'dist/paravel.cjs',
    format: 'cjs',
    packages: 'external'
  })
  .then(() => console.log('cjs build success.'))

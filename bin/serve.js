#!/usr/bin/env node

// Native
const path = require('path')
const https = require('https')

// Packages
const micro = require('micro')
const args = require('args')
const compress = require('micro-compress')
const detect = require('detect-port')
const { coroutine } = require('bluebird')
const updateNotifier = require('update-notifier')
const { red } = require('chalk')
const nodeVersion = require('node-version')
const cert = require('openssl-self-signed-certificate')

// Utilities
const pkg = require('../package')
const listening = require('../lib/listening')
const serverHandler = require('../lib/server')
const { options, minimist } = require('../lib/options')

// Throw an error if node version is too low
if (nodeVersion.major < 6) {
  console.error(
    `${red(
      'Error!'
    )} Serve requires at least version 6 of Node. Please upgrade!`
  )
  process.exit(1)
}

// Let user know if there's an update
// This isn't important when deployed to production
if (process.env.NODE_ENV !== 'production' && pkg.dist) {
  updateNotifier({ pkg }).notify()
}

// Register the list of options
args.options(options)

// And initialize `args`
const flags = args.parse(process.argv, { minimist })

// Figure out the content directory
const directory = args.sub[0]

// Don't log anything to the console if silent mode is enabled
if (flags.silent) {
  console.log = () => {}
}

process.env.ASSET_DIR =
  '/' +
  Math.random()
    .toString(36)
    .substr(2, 10)

let current = process.cwd()

if (directory) {
  current = path.resolve(process.cwd(), directory)
}

let ignoredFiles = ['.DS_Store', '.git/']

if (flags.ignore && flags.ignore.length > 0) {
  ignoredFiles = ignoredFiles.concat(flags.ignore.split(','))
}

const handler = coroutine(function*(req, res) {
  yield serverHandler(req, res, flags, current, ignoredFiles)
})

const httpsOpts = {
  key: cert.key,
  cert: cert.cert,
  passphrase: cert.passphrase
}

const microHttps = fn =>
  https.createServer(httpsOpts, (req, res) => micro.run(req, res, fn))
const server = flags.ssl
  ? microHttps(flags.unzipped ? handler : compress(handler))
  : micro(flags.unzipped ? handler : compress(handler))

const port = flags.port
const serverPath = flags.path

Promise.resolve(serverPath || detect(port)).then(portOrPath => {
  let inUse = !serverPath && portOrPath !== port

  if (inUse) {
    inUse = {
      old: port,
      open: portOrPath
    }
  }

  const listenArgs = [
    server,
    current,
    inUse,
    flags.clipless !== true,
    flags.portOrPath,
    serverPath,
    flags.ssl
  ]

  server.listen(portOrPath, listening.bind(this, ...listenArgs))
})

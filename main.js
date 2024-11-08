#!/usr/bin/env node

import fs from "fs"
import _ from "colors"
import child_process from "child_process"
import util from "util"
import { resolve } from "path"
const execPromise = util.promisify(child_process.exec)

const usage = `usage: git-ls [options] [/path/to/parent1] [/path/to/parent2] [...]

options:
  -h, --help      Show this help message and exit
  -o, --only-git  Only show git repositories
  -s, --short     Use ⇣⇡↕!+? symbols for status
  -i, --ignore    Only repo with status flags
  -q, --quiet     Do not show progress
  -v, --verbose   Show verbose output
  --update        Upgrade git-ls with latest version
  --upgrade       Alias for --update
`

const isInteractive = process.stdout.isTTY
const descriptorsHashMap = {}
const options = {
  onlyGit: false,
  quiet: !isInteractive,
  shortStatusDisplay: false,
  onlyWithStatus: false,
  verbose: false,
}

const main = async () => {
  const targets = []
  const folders = []
  const filteredFolders = []
  const args = process.argv.slice(2)

  // parse args. First parse options, then when first arg without - or -- is found, parse folders. Allow for multiple -oqetc to be combined
  let parametersEnded = false
  for (const arg of args) {
    if (!parametersEnded && arg.startsWith("-")) {
      if (arg === "-h" || arg === "--help") {
        console.log(usage)
        process.exit(0)
      } else if (arg === "--") {
        parametersEnded = true
      } else if (arg.startsWith("--")) {
        // Handle long options
        if (arg === "--only-git") {
          options.onlyGit = true
        } else if (arg === "--quiet") {
          options.quiet = true
        } else if (arg === "--ignore") {
          options.onlyWithStatus = true
        } else if (arg === "--short") {
          options.shortStatusDisplay = true
        } else if (arg === "--verbose") {
          options.verbose = true
        } else if (arg === "--update" || arg === "--upgrade") {
          await doUpdate()
          process.exit(0)
        } else {
          console.error(`Unknown option: ${arg}`)
          console.log(usage)
          process.exit(1)
        }
      } else {
        // Handle combined short options like -oq
        const shortOptions = arg.slice(1).split("")
        for (const opt of shortOptions) {
          if (opt === "o") {
            options.onlyGit = true
          } else if (opt === "q") {
            options.quiet = true
          } else if (opt === "s") {
            options.shortStatusDisplay = true
          } else if (opt === "v") {
            options.verbose = true
          } else if (opt === "i") {
            options.onlyWithStatus = true
          } else {
            console.error(`Unknown option: -${opt}`)
            console.log(usage)
            process.exit(1)
          }
        }
      }
    } else {
      targets.push(arg)
    }
  }

  if (targets.length === 0) {
    targets.push(".")
  }

  // read folders in each target
  for (const target of targets) {
    const targetFolders = await fs.promises.readdir(target)

    // filter out folders
    const targetFilteredFolders = targetFolders
      .filter((folder) => {
        try {
          return fs.lstatSync(`${target}/${folder}`).isDirectory()
        } catch {
          return false
        }
      })
      .map((e) => {
        if (target === ".") return e
        else return `${target}/${e}`
      })

    folders.push(...targetFolders)
    filteredFolders.push(...targetFilteredFolders)
  }

  const longestFolderName =
    filteredFolders.reduce((acc, folder) => {
      return folder.length > acc.length ? folder : acc
    }, "").length || 0

  // if is interactive
  const promises = []
  let resolvedPromises = 0

  const callback = (d) => {
    resolvedPromises++
    if (descriptorsHashMap[d.name]) return
    descriptorsHashMap[d.name] = d

    if (!options.quiet) {
      process.stdout.write("\r" + " ".repeat(longestFolderName + 16) + "\r")
      process.stdout.write(
        `\r (${Object.keys(descriptorsHashMap).length}/${
          filteredFolders.length
        }) ${d.timeEnd - d.timeStart}ms ${d.name} \r`
      )
    }
  }
  for (let i = 0; i < filteredFolders.length; i++) {
    promises.push(
      makeDescriptor(filteredFolders[i], longestFolderName).then(callback)
    )
  }

  await new Promise((resolve) => setTimeout(resolve, 1000))

  // reverse order
  for (let i = filteredFolders.length - 1; i >= 0; i--) {
    promises.push(
      makeDescriptor(filteredFolders[i], longestFolderName).then(callback)
    )
  }

  // wait for all promises to resolve
  while (Object.keys(descriptorsHashMap).length < filteredFolders.length) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const descriptors = Object.values(descriptorsHashMap)

  // clearTimeout(showRemainingTimeout) // #remaining-timeout
  if (!options.quiet)
    process.stdout.write("\r" + " ".repeat(longestFolderName + 16) + "\r")

  // sort (non-git, alphabetically)
  descriptors.sort((a, b) => {
    if (a.isGit && !b.isGit) return 1
    if (!a.isGit && b.isGit) return -1
    return String.prototype.localeCompare.call(a.name, b.name)
  })

  for (const descriptor of descriptors) {
    if (options.onlyGit && !descriptor.isGit) continue
    if (options.onlyWithStatus && descriptor.stateDisplayParts.length === 0)
      continue
    console.log(descriptor.toString())
  }
}

let longestName = {}
const setLongestName = (key, string) => {
  if (!longestName[key]) {
    longestName[key] = 0
  }
  if (string.length > longestName[key]) {
    longestName[key] = string.length
  }
}

const getLongestName = (key) => {
  return longestName[key] || 0
}

const padEndName = (key, string) => {
  return string.padEnd(getLongestName(key), " ")
}

let cmdTimes = {}
const cmdTimeStart = (key) => {
  cmdTimes[key] = Date.now()
}
const cmdTimeEnd = (key) => {
  if (!cmdTimes[key]) return
  const time = Date.now() - cmdTimes[key]
  delete cmdTimes[key]
  if (options.verbose)
    console.log(`time: ${time.toString().padStart(8)}ms ${key}`)
  return time
}

const makeDescriptor = async (folder, longestFolderName) => {
  const d = {
    timeStart: Date.now(),
    name: folder,
    nameDisplay: folder.padEnd(longestFolderName, " "),

    toString() {
      if (!d.isGit)
        return (
          this.nameDisplay.gray.italic + " not-a-git-repository".gray.italic
        )

      let branchPart = padEndName("branch", this.branch)
      if (this.isDirty) {
        branchPart = branchPart.cyan
      } else {
        branchPart = branchPart.gray
      }

      let statePart = padEndName("stateDisplay", this.stateDisplay)
      if (this.stateDisplay.length > 0) {
        statePart = statePart.red
      }

      let originPart = padEndName(
        "remoteOriginUrl",
        !this.remoteOriginUrl ? "no-remote" : this.remoteOriginUrl
      )
      if (!this.remoteOriginUrl) {
        originPart = originPart.yellow
      } else if (this.needsGitPull) {
        originPart = originPart.white
      } else {
        originPart = originPart.gray
      }

      return `${this.nameDisplay} ${branchPart} ${statePart} ${originPart}`
    },
  }

  d.isGit = false
  try {
    await fs.promises.stat(`${folder}/.git`)
    d.isGit = true
  } catch {}
  // if not git, return
  if (!d.isGit) {
    d.timeEnd = Date.now()
    return d
  }

  d.branch = (
    await execPromise(`git -C ${folder} branch --show-current`)
  ).stdout.trim()
  setLongestName("branch", d.branch)

  d.isDirty =
    (await execPromise(`git -C ${folder} status --porcelain`)).stdout.trim()
      .length > 0

  try {
    d.remoteOriginUrl = (
      await execPromise(`git -C ${folder} remote get-url origin`)
    ).stdout.trim()
    setLongestName("remoteOriginUrl", d.remoteOriginUrl)
  } catch {}

  cmdTimeStart(`hasUntracked ${folder}`)
  d.hasUntracked = (
    await execPromise(`git -C ${folder} ls-files --others --exclude-standard`)
  ).stdout.trim().length
  cmdTimeEnd(`hasUntracked ${folder}`)

  d.hasPendingChangesFromTrackedFiles = false
  try {
    cmdTimeStart(`hasPendingChangesFromTrackedFiles ${folder}`)
    d.hasPendingChangesFromTrackedFiles =
      (await execPromise(`git -C ${folder} diff --name-only`)).stdout.trim()
        .length > 0
  } catch {}
  cmdTimeEnd(`hasPendingChangesFromTrackedFiles ${folder}`)

  d.needsGitCommit = false
  try {
    cmdTimeStart(`needsGitCommit ${folder}`)
    d.needsGitCommit =
      (
        await execPromise(`git -C ${folder} diff --staged --name-only`)
      ).stdout.trim().length > 0
  } catch {}
  cmdTimeEnd(`needsGitCommit ${folder}`)

  d.needsGitPush = false
  try {
    cmdTimeStart(`needsGitPush ${folder}`)
    d.needsGitPush =
      (await execPromise(`git -C ${folder} log @{u}..`)).stdout.trim().length >
      0
  } catch {}
  cmdTimeEnd(`needsGitPush ${folder}`)

  d.needsGitPull = false
  if (d.remoteOriginUrl) {
    cmdTimeStart(`needsGitPull ${folder}`)
    try {
      const attemptsMax = 10
      let attempts = attemptsMax
      while (attempts > 0) {
        if (descriptorsHashMap[folder]) throw new Error("cancelled")
        try {
          const result = await execPromise(
            `git -C ${folder} fetch -q && git -C ${folder} log ..@{u}`,
            { timeout: 2000 + (attemptsMax - attempts) * 500 }
          )
          d.needsGitPull = result.stdout.trim().length > 0
          break
        } catch (err) {
          attempts--
          if (attempts === 0) throw err
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    } catch {}
  }
  cmdTimeEnd(`needsGitPull ${folder}`)

  d.isInMergeState = false
  try {
    await fs.promises.stat(`${folder}/.git/MERGE_HEAD`)
    d.isInMergeState = true
  } catch {}

  d.stateDisplayParts = []

  // readability
  const ds = d.stateDisplayParts
  const s = stateDisplayMode[options.shortStatusDisplay ? "short" : "full"]

  if (d.needsGitPull && d.needsGitPush) ds.push(s.needsGitPullAndPush)
  else if (d.needsGitPush) ds.push(s.needsGitPush)
  else if (d.needsGitPull) ds.push(s.needsGitPull)

  if (d.hasPendingChangesFromTrackedFiles)
    ds.push(s.hasPendingChangesFromTrackedFiles)
  if (d.needsGitCommit) ds.push(s.needsGitCommit)
  if (d.hasUntracked) ds.push(s.hasUntracked)

  d.stateDisplay = ds.join(s.joiner)

  if (d.stateDisplay.length > 0) d.stateDisplay = `[${d.stateDisplay}]`

  setLongestName("stateDisplay", d.stateDisplay)

  d.timeEnd = Date.now()
  return d
}

// __dirname for ESM
const __dirname = new URL(".", import.meta.url).pathname
const doUpdate = async () => {
  // fetch master from remote and count commits
  try {
    // get current ref
    const currentRef = (
      await execPromise(`git -C "${__dirname}" rev-parse HEAD`)
    ).stdout.trim()

    const pullResult = await execPromise(
      `git -C "${__dirname}" pull origin master --ff-only`
    )
    console.log("git:", pullResult.stdout.trim())

    try {
      const npmResult = await execPromise(`npm install  --no-audit`, {
        cwd: __dirname,
      })
      console.log("npm:", npmResult.stdout.trim())
    } catch (e) {
      console.log("npm install failed with following message:")
      console.error(e)
      console.log(
        `-----\n\nYou might want to run "npm install" manually (cd ${__dirname}; npm install)`
      )
    }

    const getNewRef = (
      await execPromise(`git -C "${__dirname}" rev-parse HEAD`)
    ).stdout.trim()

    if (currentRef !== getNewRef) {
      console.log(`git-ls: updated from ${currentRef} to ${getNewRef}`.green)
    }

    return
  } catch (e) {
    console.log("Update failed with following message:".red)
    console.error(e)
  }
}

main()

const stateDisplayMode = {
  short: {
    needsGitPull: "⇣",
    needsGitPush: "⇡",
    needsGitPullAndPush: "↕",
    hasPendingChangesFromTrackedFiles: "!",
    needsGitCommit: "+",
    hasUntracked: "?",
    joiner: "",
  },
  full: {
    needsGitPull: "pull",
    needsGitPush: "push",
    needsGitPullAndPush: "pull push",
    hasPendingChangesFromTrackedFiles: "add",
    needsGitCommit: "commit",
    hasUntracked: "untracked",
    joiner: " ",
  },
}

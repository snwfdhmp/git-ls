#!/usr/bin/env node

import fs from "fs"
import _ from "colors"
import child_process from "child_process"
import util from "util"
import { resolve } from "path"
const execPromise = util.promisify(child_process.exec)

const usage = `usage: git-ls [options] [folder1] [folder2] [...]

options:
  -h, --help      Show this help message and exit
  -o, --only-git  Only show git repositories
  -s, --short     Use ⇣⇡↕!+? symbols for status
  -i, --ignore    Only repo with status flags
  -q, --quiet     Do not show progress
`

const isInteractive = process.stdout.isTTY
const descriptorsHashMap = {}
const options = {
  onlyGit: false,
  quiet: !isInteractive,
  shortStatusDisplay: false,
  onlyWithStatus: false,
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

  /*
    # Vérifie s'il y a des fichiers non suivis
    hasUntracked() {
        [[ -n "$(git ls-files --others --exclude-standard)" ]]
    }

    # Vérifie s'il y a des modifications en attente dans les fichiers suivis
    hasPendingChangesFromTrackedFiles() {
        ! git diff --quiet || ! git diff --cached --quiet
    }

    # Vérifie s'il y a des changements stagés qui nécessitent un commit
    needsGitCommit() { git diff --cached --quiet || echo $?; }

    # Vérifie s'il y a des commits locaux qui n'ont pas été poussés
    needsGitPush() { [ -n "$(git log @{u}.. 2>/dev/null)" ]; }

    # Vérifie s'il y a des commits distants à récupérer
    needsGitPull() { git fetch -q && [ -n "$(git log ..@{u} 2>/dev/null)" ]; }

    # Vérifie si on est dans un état de merge (conflit ou en cours)
    isInMergeState() { [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; }
  */

  d.hasUntracked = (
    await execPromise(`git -C ${folder} ls-files --others --exclude-standard`)
  ).stdout.trim().length

  d.hasPendingChangesFromTrackedFiles = false
  try {
    d.hasPendingChangesFromTrackedFiles =
      (await execPromise(`git -C ${folder} diff --name-only`)).stdout.trim()
        .length > 0
  } catch {}

  d.needsGitCommit = false
  try {
    d.needsGitCommit =
      (
        await execPromise(`git -C ${folder} diff --staged --name-only`)
      ).stdout.trim().length > 0
  } catch {}

  d.needsGitPush = false
  try {
    d.needsGitPush =
      (await execPromise(`git -C ${folder} log @{u}..`)).stdout.trim().length >
      0
  } catch {}
  d.needsGitPull = false
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

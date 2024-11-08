# git-ls: list directories and show git status

## Basic usage

![git-ls demo](https://i.imgur.com/672nita.png)

## More options

![git-ls demo2](https://i.imgur.com/PJLFUGO.png)

## Install

**⚠️ Requires node.** [How to install node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

```
git clone git@github.com:snwfdhmp/git-ls.git
# or
git clone https://github.com/snwfdhmp/git-ls.git
```

then

```
cd git-ls
chmod u+x git-ls
```

then add this directory to your path

```
export PATH="$PATH:/path/to/this/repo"
```

## Usage

```

usage: git-ls [options] [folder1] [folder2] [...]

options:
-h, --help Show this help message and exit
-o, --only-git Only show git repositories
-s, --short Use ⇣⇡↕!+? symbols for status
-i, --ignore Only repo with status flags
-q, --quiet Do not show progress

```

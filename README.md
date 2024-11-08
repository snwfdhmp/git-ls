# git-ls: list local git repos and their status

## Basic usage

![git-ls demo](https://i.imgur.com/O3ch0xq.png)

## More options

![git-ls demo2](https://i.imgur.com/Mu4yG5b.png)

## Install

**🔹 Requires node.** [How to install node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Tested on Node v18+ (might work for earlier versions)

```
$ git clone git@github.com:snwfdhmp/git-ls.git
# or
$ git clone https://github.com/snwfdhmp/git-ls.git
```

then

```
cd git-ls
npm i
chmod u+x git-ls
git config --global alias.ls "\!$(pwd)/git-ls"
```

you can now do

```
$ git ls
```

update for latest features with

```
$ git ls --update
```

## Usage

```
usage: git-ls [options] [/path/to/parent1] [/path/to/parent2] [...]

options:
  -h, --help      Show this help message and exit
  -o, --only-git  Only show git repositories
  -s, --short     Use ⇣⇡↕!+? symbols for status
  -i, --ignore    Only repo with status flags
  -q, --quiet     Do not show progress
  --update        Upgrade git-ls with latest version
  --upgrade       Alias for --update
```

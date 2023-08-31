import { readdir, stat, readFile } from 'node:fs/promises'

const getTime = file =>
    stat(file)
        .then(stats => stats.mtime.toJSON()) // mtimeMs doesn't work

const getFile = (path, ignores) => dirent => // ERROR: ({ isDirectory, name })
    ignores.some(ignore => ignore.test(dirent.name))
        ? null
        : dirent.isDirectory()
            ? traverse(`${path}/${dirent.name}`, ignores, dirent.name)
            : getTime(`${path}/${dirent.name}`)
                .then(time => ({
                    dir: false,
                    name: dirent.name,
                    time
                }))
                .catch(error => null)

const getFiles = (path, ignores) =>
    readdir(path, { withFileTypes: true })
        .then(dirents => dirents.map(getFile(path,ignores)))
        .then(files => Promise.all(files)) // ERROR: then(Promise.all)
        .then(files => files.filter(file => file !== null))
        .then(files => files.reduce((obj, file) => (obj[file.name] = file, delete file.name, obj), {}))

const traverse = (path, ignores, name) =>
    getFiles(path, ignores)
        .then(files => ({
            dir: true,
            name,
            files
        }))
        .catch(error => null)

export const getState = path =>
    readFile(`${path}/.syncignore`, 'utf8')
        .catch(error => 'node_modules\n\\.git\n\\.next')
        .then(string =>
            string.split(/(\r\n|\r|\n)+/)
                .filter(token => token !== '')
                .map(token => new RegExp(token)))
        .then(ignores =>
            traverse(path, ignores, path))

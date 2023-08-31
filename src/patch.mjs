import { readFile } from 'node:fs/promises'

const removePatch = (path, patches) =>
    patches.push(Promise.resolve({
        type: 'rm',
        path
    }))

const writePatch = (file, path, patches) =>
    patches.push(
        readFile(path)
            .then(content => ({
                type: 'write',
                path,
                time: file.time,
                content: content.toString('base64')
            }))
    )

const createPatch = (file, path, patches) => {
    if (file.dir) {
        patches.push(Promise.resolve({
            type: 'mkdir',
            path
        }))
        for (const key in file.files) {
            createPatch(
                file.files[key],
                `${path}/${key}`,
                patches
            )
        }
    } else {
        writePatch(file, path, patches)
    }
}

export const patch = (prev, next, path, patches) => {
    for (const key in next.files) {
        const p = prev.files[key]
        const n = next.files[key]
        if (p) {
            if (p.dir !== n.dir) {
                removePatch(`${path}/${key}`, patches)
                createPatch(n, `${path}/${key}`, patches)
            } else if (p.dir) {
                patch(p, n, `${path}/${key}`, patches)
            } else if (p.time !== n.time) { // !p.dir
                writePatch(n, `${path}/${key}`, patches)
            } // p.time === n.time
        } else {
            createPatch(n, `${path}/${key}`, patches)
        }
    }
    for (const key in prev.files) {
        if (!(key in next.files)) {
            removePatch(`${path}/${key}`, patches)
        }
    }
}

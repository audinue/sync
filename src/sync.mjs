import { client } from './socket.mjs'
import { getState } from './state.mjs'
import { patch } from './patch.mjs'
import { watch } from 'node:fs'

const getHost = address => address.split(':')[0]

const getPort = address => address.split(':')[1]

const debounce = f => {
    let t = 0
    return () => {
        clearTimeout(t)
        t = setTimeout(f, 500)
    }
}

const sendPatches = (dir, server, prev) => {
    return getState(dir)
        .then(next => {
            const patches = []
            patch(prev.value, next, dir, patches)
            if (patches.length) {
                Promise.all(patches)
                    .then(patches => {
                        patches.forEach(patch => {
                            patch.path = patch.path.replace(dir, '')
                            console.log('send', patch.type, patch.path)
                        })
                        server.send(patches)
                        prev.value = next
                    })
            }
        })
}

// Role:
//   watch changes
//   send patches
const main = (dir, address) =>
    client({
        host: getHost(address),
        port: getPort(address),
        data (server, data) {
            console.log('Connected to', address)
            const prev = { value: data }
            sendPatches(dir, server, prev)
                .then(() => {
                    watch(dir, { recursive: true })
                        .on('change', debounce(() => sendPatches(dir, server, prev)))
                })
        },
        close () {
            process.exit()
        }
    })

if (process.argv.length < 4) {
    console.log(`Usage:
    node sync.js <dir> <address>
`)
} else {
    main(process.argv[2], process.argv[3])
}

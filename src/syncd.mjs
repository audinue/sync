import { server } from './socket.mjs'
import { getState } from './state.mjs'
import { writeFile, utimes, mkdir, rm } from 'node:fs/promises'

// Role:
//   send initial state
//   execute patches
const main = (dir, port) =>
    server({
        port,
        open (client) {
            console.log('Connected to a client')
            getState(dir)
                .then(state => client.send(state))
        },
        data (client, patches) {
            for (const patch of patches) {
                const path = dir + patch.path
                console.log('receive', patch.type, path)
                switch (patch.type) {
                    case 'write':
                        writeFile(path, Buffer.from(patch.content, 'base64'))
                            .then(() => utimes(path, new Date(), new Date(patch.time)))
                            .catch(console.error)
                        break
                    case 'mkdir':
                        mkdir(path, { recursive: true })
                            .catch(console.error)
                        break
                    case 'rm':
                        rm(path, { recursive: true })
                            .catch(console.error)
                        break
                }
            }
        }
    })

if (process.argv.length < 4) {
    console.log(`Usage:
    node syncd.js <dir> <port>
`)
} else {
    main(process.argv[2], process.argv[3])
}

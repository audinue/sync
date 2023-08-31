import { createServer, createConnection } from 'node:net'

const handler = (socket, opts) => {
    opts = {
        open: (remote) => {},
        close: (remote) => {},
        data: (remote, data) => {},
        ...opts
    }
    const remote = {
        socket,
        send (message) {
            const string = JSON.stringify(message)
            socket.write(`${string.length};${string}`)
        },
        close () {
            socket.end()
        }
    }
    opts.open(remote)
    let whole = null
    let length = 0
    socket
        .setEncoding('utf8')
        .on('data', chunk => {
            if (whole === null) {
                const index = chunk.indexOf(';')
                length = parseInt(chunk.substr(0, index))
                whole = chunk.substr(index + 1)
            } else {
                whole += chunk
            }
            if (whole.length === length) {
                opts.data(remote, JSON.parse(whole))
                whole = null
            }
        })
        .on('close', () => opts.close(remote))
        .on('error', console.error)
}

export const server = opts => {
    opts = {
        port: 5555,
        ...opts
    }
    createServer(socket => handler(socket, opts)).listen(opts.port)
}

export const client = opts => {
    opts = {
        host: '127.0.0.1',
        port: 5555,
        ...opts
    }
    const socket = createConnection(opts.port, opts.host, () => handler(socket, opts))
}

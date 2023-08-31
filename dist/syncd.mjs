import { createServer } from 'node:net';
import { readFile, readdir, stat, rm, mkdir, writeFile, utimes } from 'node:fs/promises';

const handler = (socket, opts) => {
    opts = {
        open: (remote) => {},
        close: (remote) => {},
        data: (remote, data) => {},
        ...opts
    };
    const remote = {
        socket,
        send (message) {
            const string = JSON.stringify(message);
            socket.write(`${string.length};${string}`);
        },
        close () {
            socket.end();
        }
    };
    opts.open(remote);
    let whole = null;
    let length = 0;
    socket
        .setEncoding('utf8')
        .on('data', chunk => {
            if (whole === null) {
                const index = chunk.indexOf(';');
                length = parseInt(chunk.substr(0, index));
                whole = chunk.substr(index + 1);
            } else {
                whole += chunk;
            }
            if (whole.length === length) {
                opts.data(remote, JSON.parse(whole));
                whole = null;
            }
        })
        .on('close', () => opts.close(remote))
        .on('error', console.error);
};

const server = opts => {
    opts = {
        port: 5555,
        ...opts
    };
    createServer(socket => handler(socket, opts)).listen(opts.port);
};

const getTime = file =>
    stat(file)
        .then(stats => stats.mtime.toJSON()); // mtimeMs doesn't work

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
                .catch(error => null);

const getFiles = (path, ignores) =>
    readdir(path, { withFileTypes: true })
        .then(dirents => dirents.map(getFile(path,ignores)))
        .then(files => Promise.all(files)) // ERROR: then(Promise.all)
        .then(files => files.filter(file => file !== null))
        .then(files => files.reduce((obj, file) => (obj[file.name] = file, delete file.name, obj), {}));

const traverse = (path, ignores, name) =>
    getFiles(path, ignores)
        .then(files => ({
            dir: true,
            name,
            files
        }))
        .catch(error => null);

const getState = path =>
    readFile(`${path}/.syncignore`, 'utf8')
        .catch(error => 'node_modules\n\\.git\n\\.next')
        .then(string =>
            string.split(/(\r\n|\r|\n)+/)
                .filter(token => token !== '')
                .map(token => new RegExp(token)))
        .then(ignores =>
            traverse(path, ignores, path));

// Role:
//   send initial state
//   execute patches
const main = (dir, port) =>
    server({
        port,
        open (client) {
            console.log('Connected to a client');
            getState(dir)
                .then(state => client.send(state));
        },
        data (client, patches) {
            for (const patch of patches) {
                const path = dir + patch.path;
                console.log('receive', patch.type, path);
                switch (patch.type) {
                    case 'write':
                        writeFile(path, Buffer.from(patch.content, 'base64'))
                            .then(() => utimes(path, new Date(), new Date(patch.time)))
                            .catch(console.error);
                        break
                    case 'mkdir':
                        mkdir(path, { recursive: true })
                            .catch(console.error);
                        break
                    case 'rm':
                        rm(path, { recursive: true })
                            .catch(console.error);
                        break
                }
            }
        }
    });

if (process.argv.length < 4) {
    console.log(`Usage:
    node syncd.js <dir> <port>
`);
} else {
    main(process.argv[2], process.argv[3]);
}

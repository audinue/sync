import { createConnection } from 'node:net';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';

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

const client = opts => {
    opts = {
        host: '127.0.0.1',
        port: 5555,
        ...opts
    };
    const socket = createConnection(opts.port, opts.host, () => handler(socket, opts));
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

const removePatch = (path, patches) =>
    patches.push(Promise.resolve({
        type: 'rm',
        path
    }));

const writePatch = (file, path, patches) =>
    patches.push(
        readFile(path)
            .then(content => ({
                type: 'write',
                path,
                time: file.time,
                content: content.toString('base64')
            }))
    );

const createPatch = (file, path, patches) => {
    if (file.dir) {
        patches.push(Promise.resolve({
            type: 'mkdir',
            path
        }));
        for (const key in file.files) {
            createPatch(
                file.files[key],
                `${path}/${key}`,
                patches
            );
        }
    } else {
        writePatch(file, path, patches);
    }
};

const patch = (prev, next, path, patches) => {
    for (const key in next.files) {
        const p = prev.files[key];
        const n = next.files[key];
        if (p) {
            if (p.dir !== n.dir) {
                removePatch(`${path}/${key}`, patches);
                createPatch(n, `${path}/${key}`, patches);
            } else if (p.dir) {
                patch(p, n, `${path}/${key}`, patches);
            } else if (p.time !== n.time) { // !p.dir
                writePatch(n, `${path}/${key}`, patches);
            } // p.time === n.time
        } else {
            createPatch(n, `${path}/${key}`, patches);
        }
    }
    for (const key in prev.files) {
        if (!(key in next.files)) {
            removePatch(`${path}/${key}`, patches);
        }
    }
};

const getHost = address => address.split(':')[0];

const getPort = address => address.split(':')[1];

const debounce = f => {
    let t = 0;
    return () => {
        clearTimeout(t);
        t = setTimeout(f, 500);
    }
};

const sendPatches = (dir, server, prev) => {
    return getState(dir)
        .then(next => {
            const patches = [];
            patch(prev.value, next, dir, patches);
            if (patches.length) {
                Promise.all(patches)
                    .then(patches => {
                        patches.forEach(patch => {
                            patch.path = patch.path.replace(dir, '');
                            console.log('send', patch.type, patch.path);
                        });
                        server.send(patches);
                        prev.value = next;
                    });
            }
        })
};

// Role:
//   watch changes
//   send patches
const main = (dir, address) =>
    client({
        host: getHost(address),
        port: getPort(address),
        data (server, data) {
            console.log('Connected to', address);
            const prev = { value: data };
            sendPatches(dir, server, prev)
                .then(() => {
                    watch(dir, { recursive: true })
                        .on('change', debounce(() => sendPatches(dir, server, prev)));
                });
        },
        close () {
            process.exit();
        }
    });

if (process.argv.length < 4) {
    console.log(`Usage:
    node sync.js <dir> <address>
`);
} else {
    main(process.argv[2], process.argv[3]);
}

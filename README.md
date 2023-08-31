# sync

Simple, ineffecient directory sync that works :P

`sync` syncs client directory to server directory.

## Usage

Copy `dist/syncd.js` to the server somehow.

Run `node syncd.js <dir> <port>` e.g. `node syncd.js foo 5555`

Copy `dist/sync.js` to the client.

Run `node sync.js <dir> <address>` e.g. `node sync.js foo 5555`

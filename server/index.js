import express from "express";
import logger from "morgan";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { createClient } from "@libsql/client";

const app = express();
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: {}
    }
});

const db = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_AUTH_TOKEN,
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    content TEXT)`)

io.on('connection', async(socket) => {
    console.log("A user has connected")

    socket.on('disconnect', () => {
        console.log("A user has disconnected")
    })

    socket.on('chat message', async (msg) => {
        let result;
        const user = socket.handshake.auth.user ?? 'Anonymous'
        try {
            result = await db.execute({ sql: 'INSERT INTO messages (content, user) VALUES (:msg, :user)', args: { msg, user } });
        } catch (error) {
            console.error(error)
            return
        }
        io.emit('chat message', msg, result.lastInsertRowid.toString(), user)
    })


    if(!socket.recovered){
        try {
            const results = await db.execute({sql: 'SELECT message_id, content, user FROM messages WHERE message_id > ?', args: [socket.handshake.auth.serverOffset ?? 0]})
            results.rows.forEach((row) => {
                socket.emit('chat message', row.content, row.message_id.toString(), row.user)
            })
        } catch (error) {
            console.error(error)
            return
        }
    }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html');
})

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

// FIELD PARAMS
const FIELD_WIDTH = 1300;
const FIELD_HEIGHT = 900;
const PITCH_MARGIN = 50;
const BALL_RADIUS = 15;
const PLAYER_RADIUS = 24;
const GOAL_WIDTH = 250;
const POST_RADIUS = 10;

let rooms = {};
const playerToRoom = {};

function createInitialState(hostId) {
    return {
        hostId: hostId,
        isLobby: true,
        players: {},
        ball: {
            x: 650, y: 450, vx: 0, vy: 0,
            radius: 15, possessor: null, lastPossessor: null,
            cooldown: 0, lockedAxis: null, lockX: 650, lockY: 450
        },
        score: [0, 0],
        timer: 120,
        goalPending: false,
        resetAt: 0,
        isPaused: true,
        lastUpdate: Date.now(),
        timerUpdate: Date.now()
    };
}

function generateRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (rooms[code]);
    return code;
}

const goalPosts = [
    { x: 50, y: 325 }, { x: 50, y: 575 },
    { x: 1250, y: 325 }, { x: 1250, y: 575 }
];

function checkCircleCollision(c1, c2, extraRadius = 0) {
    const dx = c1.x - c2.x; const dy = c1.y - c2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r1 = c1.radius || PLAYER_RADIUS;
    const r2 = c2.radius || BALL_RADIUS;
    return dist < (r1 + r2 + extraRadius);
}

function resetBall(roomCode) {
    const gameState = rooms[roomCode];
    if (!gameState) return;
    gameState.ball.x = 650; gameState.ball.y = 450;
    gameState.ball.vx = 0; gameState.ball.vy = 0;
    gameState.ball.possessor = null; gameState.ball.lockedAxis = 'both';
    gameState.ball.lockX = 650; gameState.ball.lockY = 450;
    gameState.ball.cooldown = 1;
}

setInterval(() => {
    const now = Date.now();

    for (const code in rooms) {
        const gameState = rooms[code];
        const dt = Math.min(0.05, (now - gameState.lastUpdate) / 1000);
        gameState.lastUpdate = now;

        // Timer logic
        const playerCount = Object.keys(gameState.players).length;
        if (!gameState.isLobby && playerCount > 0 && gameState.timer > 0 && !gameState.goalPending) {
            if (now - gameState.timerUpdate >= 1000) {
                gameState.timer--;
                gameState.timerUpdate = now;
            }
        }

        if (gameState.isLobby) {
            io.to(code).emit('gameUpdate', gameState);
            continue;
        }

        if (gameState.ball.cooldown > 0) gameState.ball.cooldown -= dt;
        if (gameState.goalPending && now > gameState.resetAt) {
            gameState.goalPending = false;
            resetBall(code);
        }

        const b = gameState.ball;
        // --- BALL MOVEMENT ---
        if (b.possessor && gameState.players[b.possessor]) {
            const p = gameState.players[b.possessor];
            const orbX = Math.cos(p.angle || 0) * 8;
            const orbY = Math.sin(p.angle || 0) * 8;
            if (b.lockedAxis === 'y') {
                b.x = p.x + orbX; b.y = p.y + orbY;
                if (b.lockY < 450) b.y = Math.min(50, b.y); else b.y = Math.max(850, b.y);
            } else if (b.lockedAxis === 'both') {
                b.x = b.lockX; b.y = b.lockY;
            } else {
                b.x = p.x + orbX; b.y = p.y + orbY;
            }
            b.vx = 0; b.vy = 0;
        } else {
            if (!gameState.goalPending) {
                goalPosts.forEach(post => {
                    const dx = b.x - post.x; const dy = b.y - post.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 25 && dist > 0) {
                        const nx = dx / dist; const ny = dy / dist;
                        const dot = b.vx * nx + b.vy * ny;
                        if (dot < 0) { b.vx = (b.vx - 2 * dot * nx) * 0.7; b.vy = (b.vy - 2 * dot * ny) * 0.7; }
                        b.x = post.x + nx * 25; b.y = post.y + ny * 25;
                    }
                });
            }
            b.x += b.vx * dt * 60; b.y += b.vy * dt * 60;
            b.vx *= (gameState.goalPending ? 0.92 : 0.982); b.vy *= (gameState.goalPending ? 0.92 : 0.982);
        }

        // --- BOUNDARIES & GOALS ---
        if (!b.lockedAxis) {
            if (b.x < 50 || b.x > 1250) {
                if (b.y > 310 && b.y < 590) {
                    if (!gameState.goalPending) {
                        gameState.goalPending = true; gameState.resetAt = now + 2500;
                        if (b.x < 50) gameState.score[1]++; else gameState.score[0]++;
                        io.to(code).emit('goalScored', { score: gameState.score, side: b.x < 50 ? 'left' : 'right' });
                        b.vx *= 0.5; b.vy *= 0.5; b.possessor = null; b.cooldown = 4.0;
                    }
                    b.x = b.x < 50 ? Math.max(10, b.x) : Math.min(1290, b.x);
                } else if (b.cooldown <= 0 && !gameState.goalPending) {
                    const lp = b.lastPossessor ? gameState.players[b.lastPossessor] : null;
                    const attackingTeam = b.x < 50 ? 2 : 1;
                    const isCorner = lp && lp.team !== attackingTeam;
                    b.vx = 0; b.vy = 0; b.possessor = null; b.lockedAxis = 'both';
                    b.lockX = (b.x < 50 ? 50 : 1250);
                    b.lockY = isCorner ? (b.y < 450 ? 50 : 850) : 450;
                    if (!isCorner && b.x < 50) b.lockX += 40; if (!isCorner && b.x > 1250) b.lockX -= 40;
                    b.x = b.lockX; b.y = b.lockY;
                    io.to(code).emit('notification', { message: isCorner ? 'KORNER!' : 'KALE VURUŞU!' });
                }
            } else if ((b.y < 50 || b.y > 850) && b.cooldown <= 0 && !gameState.goalPending) {
                b.vx = 0; b.vy = 0; b.possessor = null; b.lockedAxis = 'y';
                b.lockX = b.x; b.lockY = (b.y < 50) ? 50 : 850;
                b.x = b.lockX; b.y = b.lockY;
                io.to(code).emit('notification', { message: 'TAÇ!' });
            }
        }
        b.x = Math.max(7, Math.min(1293, b.x)); b.y = Math.max(7, Math.min(893, b.y));

        for (const id in gameState.players) {
            const p = gameState.players[id];
            let dx = 0; let dy = 0;
            if (p.inputs.up) dy -= 1; if (p.inputs.down) dy += 1;
            if (p.inputs.left) dx -= 1; if (p.inputs.right) dx += 1;

            if (b.possessor === id && b.lockedAxis === 'both') {
                p.x = b.lockX - Math.cos(p.angle || 0) * 12; p.y = b.lockY - Math.sin(p.angle || 0) * 12;
            } else if (b.possessor === id && b.lockedAxis === 'y') {
                const range = 120;
                p.x = Math.max(b.lockX - range, Math.min(b.lockX + range, p.x + dx * 3.5 * dt * 60));
                p.x = Math.max(50, Math.min(1250, p.x)); p.y = (b.lockY < 450) ? 30 : 870;
                b.x = p.x;
            } else {
                const mag = Math.sqrt(dx * dx + dy * dy);
                const playerSpeed = 5.2; // Base speed
                const moveDist = playerSpeed * dt * 60; // Standardized to 60fps base
                p.x += (dx / (mag || 1)) * (mag ? moveDist : 0);
                p.y += (dy / (mag || 1)) * (mag ? moveDist : 0);
            }
            p.x = Math.max(24, Math.min(1276, p.x)); p.y = Math.max(24, Math.min(876, p.y));

            if (b.cooldown <= 0 && (!b.possessor || b.possessor !== id) && checkCircleCollision(p, b, b.lockedAxis ? 50 : 25)) {
                b.possessor = id; b.lastPossessor = id;
            }
        }
        io.to(code).emit('gameUpdate', gameState);
    }
}, 1000 / 60);

io.on('connection', (socket) => {
    socket.on('autoCreateRoom', (name) => {
        const code = generateRoomCode();
        rooms[code] = createInitialState(socket.id);
        joinPlayerToRoom(socket, code, name);
    });

    socket.on('createRoom', (data) => {
        const { code, name } = data;
        if (rooms[code]) return socket.emit('notification', { message: 'Oda zaten mevcut!' });

        rooms[code] = createInitialState(socket.id);
        joinPlayerToRoom(socket, code, name);
    });

    socket.on('joinRoom', (data) => {
        const { code, name } = data;
        if (!rooms[code]) return socket.emit('notification', { message: 'Geçersiz Oda Kodu!' });

        const playerCount = Object.keys(rooms[code].players).length;
        if (playerCount >= 10) return socket.emit('notification', { message: 'Oda Dolu! (Max 5vs5)' });

        joinPlayerToRoom(socket, code, name);
    });

    function joinPlayerToRoom(socket, code, name) {
        socket.join(code);
        playerToRoom[socket.id] = code;
        const gameState = rooms[code];

        const teams = Object.values(gameState.players).reduce((acc, p) => { acc[p.team]++; return acc; }, { 1: 0, 2: 0 });
        const team = teams[1] <= teams[2] ? 1 : 2;

        gameState.players[socket.id] = {
            id: socket.id, name: name || 'Oyuncu', team,
            x: team === 1 ? 250 : 1050, y: 450,
            inputs: { up: false, down: false, left: false, right: false },
            angle: 0
        };

        socket.emit('init', { id: socket.id, gameState, roomCode: code });
        io.to(code).emit('gameUpdate', gameState);
        console.log(`Player ${name} joined room ${code}`);
    }

    socket.on('switchTeam', (team) => {
        const code = playerToRoom[socket.id];
        if (!code || !rooms[code]) return;
        const gameState = rooms[code];
        if (!gameState.isLobby) return;

        const teamPlayers = Object.values(gameState.players).filter(p => p.team === team);
        if (teamPlayers.length >= 5) return socket.emit('notification', { message: 'Bu takım dolu!' });

        if (gameState.players[socket.id]) {
            gameState.players[socket.id].team = team;
            gameState.players[socket.id].x = team === 1 ? 250 : 1050;
            io.to(code).emit('gameUpdate', gameState);
        }
    });

    socket.on('startMatch', () => {
        const code = playerToRoom[socket.id];
        if (!code || !rooms[code]) return;
        const gameState = rooms[code];
        if (gameState.hostId !== socket.id) return;

        gameState.isLobby = false;
        gameState.isPaused = false;
        io.to(code).emit('gameStarted');
    });

    socket.on('input', (i) => {
        const code = playerToRoom[socket.id];
        if (code && rooms[code] && rooms[code].players[socket.id]) rooms[code].players[socket.id].inputs = i;
    });

    socket.on('aim', (d) => {
        const code = playerToRoom[socket.id];
        if (code && rooms[code] && rooms[code].players[socket.id]) rooms[code].players[socket.id].angle = d.angle;
    });

    socket.on('action', (d) => {
        const code = playerToRoom[socket.id];
        if (!code || !rooms[code]) return;
        const gameState = rooms[code];
        const b = gameState.ball;
        if (b.possessor === socket.id && !gameState.goalPending) {
            const p = gameState.players[socket.id];
            if (b.lockedAxis === 'y' && (d.x < 50 || d.x > 1250 || d.y < 50 || d.y > 850)) return;
            const dx = d.x - p.x; const dy = d.y - p.y; const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                if (b.lockedAxis !== null && d.type === 'shoot') return;
                const power = d.power || 0.05;
                let baseSpd, maxSpd;
                if (b.lockedAxis === 'y') { baseSpd = 2; maxSpd = 11; }
                else { baseSpd = (d.type === 'shoot' ? 10 : 7); maxSpd = (d.type === 'shoot' ? 38 : 22); }
                const finalSpd = baseSpd + (maxSpd - baseSpd) * power;
                b.vx = (dx / dist) * finalSpd; b.vy = (dy / dist) * finalSpd;
                const wasRestart = b.lockedAxis !== null;
                if (b.lockedAxis === 'y') b.y = (b.lockY < 450) ? 55 : 845;
                b.possessor = null; b.lockedAxis = null; b.cooldown = wasRestart ? 1.0 : 0.3;
            }
        }
    });

    socket.on('disconnect', () => {
        const code = playerToRoom[socket.id];
        if (code && rooms[code]) {
            delete rooms[code].players[socket.id];
            if (Object.keys(rooms[code].players).length === 0) {
                delete rooms[code];
                console.log(`Room ${code} closed (empty)`);
            }
        }
        delete playerToRoom[socket.id];
    });
});

server.listen(PORT, '0.0.0.0', () => { console.log(`Server started on port ${PORT}`); });

const socket = io();
console.log("PROSTRIKER_V7_FINAL_FIX_READY");

// CONSTANTS
const FIELD_WIDTH = 1300;
const FIELD_HEIGHT = 900;
const PITCH_MARGIN = 50;
const PLAYABLE_WIDTH = 1200;
const PLAYABLE_HEIGHT = 800;
const BALL_RADIUS = 15;
const PLAYER_RADIUS = 24;

let myId = null;
let gameState = {
    players: {},
    ball: { x: 650, y: 450, vx: 0, vy: 0 },
    score: [0, 0],
    timer: 120
};
let inputState = { up: false, down: false, left: false, right: false };
let netWobble = { left: 0, right: 0 };
let mousePos = { x: 650, y: 450 };
let charge = { active: false, type: null, start: 0, val: 0 }; // Power Charge State

const menuOverlay = document.getElementById('menu-overlay');
const playerNameInput = document.getElementById('player-name');
const uiOverlay = document.getElementById('ui-overlay');
const scoreT1 = document.getElementById('score-team-1');
const scoreT2 = document.getElementById('score-team-2');
const gameTimerEl = document.getElementById('game-timer');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const vfxCanvas = document.getElementById('vfx-canvas');
const vfxCtx = vfxCanvas.getContext('2d');

// UI Menus & Buttons
const mainMenu = document.getElementById('main-menu');
const joinMenu = document.getElementById('join-menu');
const lobbyMenu = document.getElementById('lobby-menu');
const escMenu = document.getElementById('esc-menu');

const showCreateBtn = document.getElementById('show-create-btn');
const showJoinBtn = document.getElementById('show-join-btn');
const confirmJoinBtn = document.getElementById('confirm-join-btn');
const backToMain2 = document.getElementById('back-to-main-2');
const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');

// Lobby Elements
const lobbyCodeDisplay = document.getElementById('lobby-code');
const team1Slots = document.getElementById('team-1-slots');
const team2Slots = document.getElementById('team-2-slots');
const joinTeam1Btn = document.getElementById('join-team-1');
const joinTeam2Btn = document.getElementById('join-team-2');
const startMatchBtn = document.getElementById('start-match-btn');
const joinRoomCode = document.getElementById('join-room-code');

let currentRoomCode = null;
let amIHost = false;

function resizeCanvas() {
    const windowRatio = window.innerWidth / window.innerHeight;
    const gameRatio = FIELD_WIDTH / FIELD_HEIGHT;
    if (windowRatio > gameRatio) {
        canvas.height = window.innerHeight * 0.95;
        canvas.width = canvas.height * gameRatio;
    } else {
        canvas.width = window.innerWidth * 0.95;
        canvas.height = canvas.width / gameRatio;
    }
    vfxCanvas.width = window.innerWidth;
    vfxCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Event Listeners
showCreateBtn.addEventListener('click', () => {
    amIHost = true;
    socket.emit('autoCreateRoom', playerNameInput.value || 'Oyuncu');
});

showJoinBtn.addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    joinMenu.classList.remove('hidden');
});

confirmJoinBtn.addEventListener('click', () => {
    amIHost = false;
    const code = joinRoomCode.value.toUpperCase();
    socket.emit('joinRoom', { code, name: playerNameInput.value || 'Oyuncu' });
});

backToMain2.addEventListener('click', () => {
    joinMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

joinTeam1Btn.addEventListener('click', () => socket.emit('switchTeam', 1));
joinTeam2Btn.addEventListener('click', () => socket.emit('switchTeam', 2));

startMatchBtn.addEventListener('click', () => {
    if (amIHost) {
        socket.emit('startMatch');
        hideMenus();
    }
});


quitBtn.addEventListener('click', () => {
    location.reload();
});

function updateLobbyUI(gameState) {
    if (menuOverlay.classList.contains('hidden')) return;

    // Hide other sub-menus, show lobby
    mainMenu.classList.add('hidden');
    joinMenu.classList.add('hidden');
    lobbyMenu.classList.remove('hidden');
    lobbyCodeDisplay.textContent = currentRoomCode;

    // Render Team 1
    team1Slots.innerHTML = '';
    const playersT1 = Object.values(gameState.players).filter(p => p.team === 1);
    for (let i = 0; i < 7; i++) {
        const p = playersT1[i];
        team1Slots.innerHTML += `<div class="player-slot ${p ? '' : 'empty'}">${p ? p.name : 'Boş Slot'}</div>`;
    }

    // Render Team 2
    team2Slots.innerHTML = '';
    const playersT2 = Object.values(gameState.players).filter(p => p.team === 2);
    for (let i = 0; i < 7; i++) {
        const p = playersT2[i];
        team2Slots.innerHTML += `<div class="player-slot ${p ? '' : 'empty'}" style="border-right-color: var(--secondary);">${p ? p.name : 'Boş Slot'}</div>`;
    }

    startMatchBtn.classList.toggle('hidden', !amIHost);
}

function hideMenus() {
    menuOverlay.classList.add('hidden');
    uiOverlay.classList.remove('hidden');
    canvas.requestPointerLock();
}

const keyMap = { 'w': 'up', 'ArrowUp': 'up', 's': 'down', 'ArrowDown': 'down', 'a': 'left', 'ArrowLeft': 'left', 'd': 'right', 'ArrowRight': 'right' };
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const isMenuOpen = !menuOverlay.classList.contains('hidden');
        const isEscMenuVisible = !escMenu.classList.contains('hidden');

        if (isMenuOpen && isEscMenuVisible) {
            // If ESC menu is open, pressing ESC should Resume
            resumeGame();
        }
    }
    if (keyMap[e.key]) {
        inputState[keyMap[e.key]] = true;
        if ((!charge.active || charge.type !== 'shoot') && menuOverlay.classList.contains('hidden')) {
            socket.emit('input', inputState);
        }
    }
});

// Robust Pointer Lock Tracking
document.addEventListener('pointerlockchange', () => {
    const lockActive = document.pointerLockElement === canvas;
    const inMatch = menuOverlay.classList.contains('hidden');

    // If the browser exited lock but we didn't intend to pause (e.g. browser ESC logic)
    if (!lockActive && inMatch && !lockInProgress) {
        menuOverlay.classList.remove('hidden');
        mainMenu.classList.add('hidden');
        lobbyMenu.classList.add('hidden');
        escMenu.classList.remove('hidden');
    }
});

let lockInProgress = false;

function resumeGame() {
    if (lockInProgress) return;
    lockInProgress = true;

    menuOverlay.classList.add('hidden');
    escMenu.classList.add('hidden');

    // Small delay ensures the browser finishes its own ESC handling before we re-lock
    setTimeout(() => {
        canvas.requestPointerLock();
        lockInProgress = false;
    }, 50);
}

// Click to re-focus if focus is lost during match
canvas.addEventListener('click', () => {
    if (menuOverlay.classList.contains('hidden') && document.pointerLockElement !== canvas) {
        resumeGame();
    }
});

resumeBtn.addEventListener('click', resumeGame);

document.addEventListener('keyup', (e) => {
    if (keyMap[e.key]) {
        inputState[keyMap[e.key]] = false;
        if ((!charge.active || charge.type !== 'shoot') && menuOverlay.classList.contains('hidden')) {
            socket.emit('input', inputState);
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
        const scale = FIELD_WIDTH / canvas.width;
        mousePos.x = Math.max(0, Math.min(FIELD_WIDTH, mousePos.x + e.movementX * scale));
        mousePos.y = Math.max(0, Math.min(FIELD_HEIGHT, mousePos.y + e.movementY * scale));
        if (gameState.players[myId]) {
            const angle = Math.atan2(mousePos.y - gameState.players[myId].y, mousePos.x - gameState.players[myId].x);
            socket.emit('aim', { angle, x: mousePos.x, y: mousePos.y });
        }
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas && menuOverlay.classList.contains('hidden')) {
        canvas.requestPointerLock();
        return;
    }
    if (!charge.active) {
        charge.active = true;
        charge.type = e.button === 0 ? 'pass' : (e.button === 2 ? 'shoot' : null);
        charge.start = Date.now();
        charge.val = 0;

        // If shooting, stop movement immediately
        if (charge.type === 'shoot') {
            socket.emit('input', { up: false, down: false, left: false, right: false });
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (charge.active) {
        const duration = (Date.now() - charge.start) / 1000;
        const power = Math.min(1.0, duration / 1.0); // Max power in 1 second
        socket.emit('action', { type: charge.type, x: mousePos.x, y: mousePos.y, power });

        // Resume movement after shooting
        if (charge.type === 'shoot') {
            socket.emit('input', inputState);
        }

        charge.active = false;
        charge.val = 0;
    }
});

window.addEventListener('contextmenu', e => e.preventDefault());

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.vx = (Math.random() - 0.5) * 12; this.vy = (Math.random() - 0.5) * 12;
        this.alpha = 1; this.life = 0.01 + Math.random() * 0.02;
    }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= this.life; }
}
let particles = [];

socket.on('init', d => {
    myId = d.id;
    gameState = d.gameState;
    currentRoomCode = d.roomCode;
    console.log("Joined as:", myId, "Room:", currentRoomCode);
    updateLobbyUI(gameState);
});

socket.on('gameUpdate', ns => {
    gameState = ns;
    if (!menuOverlay.classList.contains('hidden') && !lobbyMenu.classList.contains('hidden')) {
        updateLobbyUI(gameState);
    }
    scoreT1.textContent = gameState.score[0];
    scoreT2.textContent = gameState.score[1];
    if (gameTimerEl) {
        const m = Math.floor(gameState.timer / 60);
        const s = gameState.timer % 60;
        gameTimerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
});

socket.on('goalScored', data => {
    showNotification('GOOOOL!');
    if (data.side === 'left') netWobble.left = 1.0; else netWobble.right = 1.0;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    for (let i = 0; i < 150; i++) {
        particles.push(new Particle(centerX, centerY, i % 2 === 0 ? '#fff' : (data.side === 'left' ? '#ff00c8' : '#00f2ff')));
    }
});

socket.on('gameStarted', () => {
    hideMenus();
});

function showNotification(text) {
    const el = document.createElement('div');
    el.style = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:120px; font-weight:900; color:#fff; text-shadow:0 0 40px rgba(0,0,0,0.9); z-index:1000; pointer-events:none; font-family:'Outfit'; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'all 0.5s';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%,-50%) scale(1.5)';
        setTimeout(() => el.remove(), 500);
    }, 2000);
}

function render() {
    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / FIELD_WIDTH;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const xM = PITCH_MARGIN * scale;
        const yM = PITCH_MARGIN * scale;
        const pW = PLAYABLE_WIDTH * scale;
        const pH = PLAYABLE_HEIGHT * scale;

        ctx.save();
        ctx.beginPath();
        ctx.rect(xM, yM, pW, pH);
        ctx.clip();

        const stripeW = 75;
        for (let i = 0; i < PLAYABLE_WIDTH; i += stripeW) {
            ctx.fillStyle = (Math.floor(i / stripeW)) % 2 === 0 ? '#388e3c' : '#1b5e20';
            ctx.fillRect(xM + (i * scale), yM, stripeW * scale, pH);
        }

        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.4 * scale;
        for (let k = 0; k < 400; k++) {
            const gx = xM + Math.random() * pW;
            const gy = yM + Math.random() * pH;
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx, gy + (Math.random() * 4) * scale);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();

        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 5 * scale;
        ctx.strokeRect(xM, yM, pW, pH);

        // Corner Arcs (Korner Yuvarlakları)
        const cornerR = 25 * scale;
        // Top Left
        ctx.beginPath(); ctx.arc(xM, yM, cornerR, 0, Math.PI / 2); ctx.stroke();
        // Top Right
        ctx.beginPath(); ctx.arc(xM + pW, yM, cornerR, Math.PI / 2, Math.PI); ctx.stroke();
        // Bottom Left
        ctx.beginPath(); ctx.arc(xM, yM + pH, cornerR, -Math.PI / 2, 0); ctx.stroke();
        // Bottom Right
        ctx.beginPath(); ctx.arc(xM + pW, yM + pH, cornerR, Math.PI, -Math.PI / 2); ctx.stroke();

        // Center Line
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, yM);
        ctx.lineTo(canvas.width / 2, yM + pH);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 85 * scale, 0, Math.PI * 2);
        ctx.stroke();

        const goalH = 250 * scale;
        const goalY = (canvas.height - goalH) / 2;
        function drawGoal(x, isLeft) {
            const w = (isLeft ? netWobble.left : netWobble.right) * Math.sin(Date.now() * 0.02) * 20 * scale;
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1 * scale;
            const netW = 35 * scale;
            for (let j = 0; j <= goalH; j += 15 * scale) {
                ctx.beginPath();
                ctx.moveTo(x, goalY + j);
                // FIXED: bezierTo -> bezierCurveTo
                ctx.bezierCurveTo(x + (isLeft ? -netW - w : netW + w), goalY + j, x + (isLeft ? -netW - w : netW + w), goalY + j, x + (isLeft ? -netW : netW), goalY + j);
                ctx.stroke();
            }
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 10 * scale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (isLeft) {
                ctx.moveTo(x, goalY); ctx.lineTo(x - 25 * scale, goalY); ctx.lineTo(x - 25 * scale, goalY + goalH); ctx.lineTo(x, goalY + goalH);
            } else {
                ctx.moveTo(x, goalY); ctx.lineTo(x + 25 * scale, goalY); ctx.lineTo(x + 25 * scale, goalY + goalH); ctx.lineTo(x, goalY + goalH);
            }
            ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, goalY); ctx.lineTo(x, goalY + goalH); ctx.stroke();
        }
        drawGoal(xM, true);
        drawGoal(xM + pW, false);
        netWobble.left *= 0.95;
        netWobble.right *= 0.95;

        const pAw = 160 * scale; const pAh = 420 * scale; const pAy = (canvas.height - pAh) / 2;
        ctx.strokeRect(xM, pAy, pAw, pAh);
        ctx.strokeRect(xM + pW - pAw, pAy, pAw, pAh);
        ctx.beginPath(); ctx.arc(xM + pAw, canvas.height / 2, 70 * scale, -Math.PI / 2.4, Math.PI / 2.4); ctx.stroke();
        ctx.beginPath(); ctx.arc(xM + pW - pAw, canvas.height / 2, 70 * scale, Math.PI - Math.PI / 2.4, Math.PI + Math.PI / 2.4); ctx.stroke();

        for (const id in gameState.players) {
            const p = gameState.players[id];
            const px = p.x * scale; const py = p.y * scale;
            ctx.save(); ctx.translate(px, py); ctx.rotate(p.angle || 0);
            const color = p.team === 1 ? '#00f2ff' : '#ff00c8';
            ctx.shadowBlur = 15 * scale; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS * scale, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5 * scale;
            ctx.beginPath(); ctx.arc(0, 0, 10 * scale, 0, Math.PI * 2); ctx.stroke();
            if (gameState.ball.possessor === id) {
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * scale;
                ctx.beginPath(); ctx.arc(0, 0, (PLAYER_RADIUS + 6) * scale, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(15 * scale, 0, 8 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${18 * scale}px Outfit`;
            ctx.textAlign = 'center';
            ctx.fillText(p.name, px, py - 45 * scale);

            // POWER BAR (Only for local player)
            if (id === myId && charge.active) {
                const barW = 60 * scale;
                const barH = 8 * scale;
                charge.val = Math.min(1.0, (Date.now() - charge.start) / 1000);

                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(px - barW / 2, py - 70 * scale, barW, barH);

                const grad = ctx.createLinearGradient(px - barW / 2, 0, px + barW / 2, 0);
                grad.addColorStop(0, p.team === 1 ? '#00f2ff' : '#ff00c8');
                grad.addColorStop(1, '#fff');

                ctx.fillStyle = grad;
                ctx.fillRect(px - barW / 2, py - 70 * scale, barW * charge.val, barH);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1 * scale;
                ctx.strokeRect(px - barW / 2, py - 70 * scale, barW, barH);
            }
        }

        const bx = gameState.ball.x * scale;
        const by = gameState.ball.y * scale;
        const br = BALL_RADIUS * scale;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333';
        function drawPattern(x, y, r) {
            ctx.beginPath(); for (let j = 0; j < 5; j++) { const a = (j * Math.PI * 2) / 5 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
            ctx.closePath(); ctx.fill();
        }
        const pS = br * 0.4;
        drawPattern(bx, by, pS);
        for (let i = 0; i < 5; i++) {
            const a = (i * Math.PI * 2) / 5;
            drawPattern(bx + Math.cos(a) * br * 0.85, by + Math.sin(a) * br * 0.85, pS * 0.8);
        }
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5 * scale; ctx.stroke();

        if (document.pointerLockElement === canvas) {
            const mx = mousePos.x * scale; const my = mousePos.y * scale;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 3 * scale;
            ctx.beginPath(); ctx.arc(mx, my, 8 * scale, 0, Math.PI * 2);
            ctx.moveTo(mx - 12 * scale, my); ctx.lineTo(mx + 12 * scale, my);
            ctx.moveTo(mx, my - 12 * scale); ctx.lineTo(mx, my + 12 * scale); ctx.stroke();
        }
    } catch (e) {
        console.error("Render loop error:", e);
    }

    vfxCtx.clearRect(0, 0, vfxCanvas.width, vfxCanvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.update();
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        vfxCtx.globalAlpha = p.alpha; vfxCtx.fillStyle = p.color;
        vfxCtx.beginPath(); vfxCtx.arc(p.x, p.y, 4, 0, Math.PI * 2); vfxCtx.fill();
    }
    vfxCtx.globalAlpha = 1.0;

    requestAnimationFrame(render);
}
requestAnimationFrame(render);

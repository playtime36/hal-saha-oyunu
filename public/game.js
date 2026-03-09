const socket = io({ transports: ['websocket', 'polling'] });
console.log("PROSTRIKER_V1.1_PRODUCTION_READY");

socket.on('connect', () => console.log("Connected to Server! ID:", socket.id));
socket.on('connect_error', (err) => console.error("Connection Error:", err));

// CONSTANTS
const FIELD_WIDTH = 1300;
const FIELD_HEIGHT = 900;
const PITCH_MARGIN = 50;
const PLAYABLE_WIDTH = 1200;
const PLAYABLE_HEIGHT = 800;
const BALL_RADIUS = 15;
const PLAYER_RADIUS = 24;

// LOAD PERSISTED NAME
const savedName = localStorage.getItem('prostriker_player_name');
if (savedName && document.getElementById('player-name')) {
    document.getElementById('player-name').value = savedName;
}

// STATE
let myId = null;
let currentRoomCode = null;
let amIHost = false;
let gameState = {
    players: {},
    ball: { x: 650, y: 450, vx: 0, vy: 0 },
    score: [0, 0],
    timer: 120
};
let inputState = { up: false, down: false, left: false, right: false };
let netWobble = { left: 0, right: 0 };
let mousePos = { x: 650, y: 450 };
let charge = { active: false, type: null, start: 0, val: 0 };

// UI ELEMENTS
const menuOverlay = document.getElementById('menu-overlay');
const mainMenu = document.getElementById('main-menu');
const joinMenu = document.getElementById('join-menu');
const lobbyMenu = document.getElementById('lobby-menu');
const escMenu = document.getElementById('esc-menu');
const uiOverlay = document.getElementById('ui-overlay');

const playerNameInput = document.getElementById('player-name');
const joinRoomCode = document.getElementById('join-room-code');
const lobbyCodeDisplay = document.getElementById('lobby-code');
const scoreT1 = document.getElementById('score-team-1');
const scoreT2 = document.getElementById('score-team-2');
const gameTimerEl = document.getElementById('game-timer');

const team1Slots = document.getElementById('team-1-slots');
const team2Slots = document.getElementById('team-2-slots');

const showCreateBtn = document.getElementById('show-create-btn');
const showJoinBtn = document.getElementById('show-join-btn');
const confirmJoinBtn = document.getElementById('confirm-join-btn');
const backToMain2 = document.getElementById('back-to-main-2');
const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');
const quitBtnLobby = document.getElementById('quit-btn-lobby');
const startMatchBtn = document.getElementById('start-match-btn');
const joinTeam1Btn = document.getElementById('join-team-1');
const joinTeam2Btn = document.getElementById('join-team-2');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const vfxCanvas = document.getElementById('vfx-canvas');
const vfxCtx = vfxCanvas.getContext('2d');

// MOBILE CONTROLS UI
const mobileControls = document.getElementById('mobile-controls');
const joyBase = document.getElementById('joystick-base');
const joyKnob = document.getElementById('joystick-knob');
const btnShoot = document.getElementById('mobile-shoot');
const btnPass = document.getElementById('mobile-pass');

// --- INITIALIZATION & SOCKETS ---

socket.on('init', d => {
    myId = d.id;
    gameState = d.gameState;
    currentRoomCode = d.roomCode;
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
    for (let i = 0; i < 150; i++) {
        particles.push(new Particle(canvas.width / 2, canvas.height / 2, i % 2 === 0 ? '#fff' : (data.side === 'left' ? '#ff00c8' : '#00f2ff')));
    }
});

socket.on('gameStarted', hideMenus);
socket.on('notification', d => showNotification(d.message));

// --- UI LOGIC ---

function updateLobbyUI(state) {
    if (menuOverlay.classList.contains('hidden')) return;
    mainMenu.classList.add('hidden');
    joinMenu.classList.add('hidden');
    lobbyMenu.classList.remove('hidden');
    lobbyCodeDisplay.textContent = currentRoomCode;

    team1Slots.innerHTML = '';
    const p1 = Object.values(state.players).filter(p => p.team === 1);
    for (let i = 0; i < 7; i++) {
        const p = p1[i];
        team1Slots.innerHTML += `<div class="player-slot ${p ? '' : 'empty'}">${p ? p.name : 'Boş Slot'}</div>`;
    }

    team2Slots.innerHTML = '';
    const p2 = Object.values(state.players).filter(p => p.team === 2);
    for (let i = 0; i < 7; i++) {
        const p = p2[i];
        team2Slots.innerHTML += `<div class="player-slot ${p ? '' : 'empty'}">${p ? p.name : 'Boş Slot'}</div>`;
    }
    startMatchBtn.classList.toggle('hidden', state.hostId !== myId);
}

function hideMenus() {
    menuOverlay.classList.add('hidden');
    uiOverlay.classList.remove('hidden');
    if (!('ontouchstart' in window)) canvas.requestPointerLock();
}

function showNotification(text) {
    const el = document.createElement('div');
    el.style = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:80px; font-weight:900; color:#fff; text-shadow:0 0 40px rgba(0,0,0,0.9); z-index:1000; pointer-events:none; font-family:'Outfit'; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'all 0.5s';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%,-50%) scale(1.5)';
        setTimeout(() => el.remove(), 500);
    }, 2000);
}

// --- EVENT LISTENERS ---

showCreateBtn.addEventListener('click', () => {
    const name = playerNameInput.value || 'Oyuncu';
    localStorage.setItem('prostriker_player_name', name);
    amIHost = true;
    socket.emit('autoCreateRoom', name);
});

showJoinBtn.addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    joinMenu.classList.remove('hidden');
});

confirmJoinBtn.addEventListener('click', () => {
    const name = playerNameInput.value || 'Oyuncu';
    localStorage.setItem('prostriker_player_name', name);
    amIHost = false;
    socket.emit('joinRoom', { code: joinRoomCode.value.toUpperCase(), name });
});

backToMain2.addEventListener('click', () => {
    joinMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

joinTeam1Btn.addEventListener('click', () => socket.emit('switchTeam', 1));
joinTeam2Btn.addEventListener('click', () => socket.emit('switchTeam', 2));
startMatchBtn.addEventListener('click', () => socket.emit('startMatch'));
quitBtnLobby.addEventListener('click', () => location.reload());
quitBtn.addEventListener('click', () => location.reload());
resumeBtn.addEventListener('click', resumeGame);

// --- KEYBOARD & MOUSE ---

const keyMap = { 'w': 'up', 'ArrowUp': 'up', 's': 'down', 'ArrowDown': 'down', 'a': 'left', 'ArrowLeft': 'left', 'd': 'right', 'ArrowRight': 'right' };
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menuOverlay.classList.contains('hidden') && !escMenu.classList.contains('hidden')) resumeGame();
    if (keyMap[e.key]) {
        inputState[keyMap[e.key]] = true;
        if (!charge.active && menuOverlay.classList.contains('hidden')) socket.emit('input', inputState);
    }
});

document.addEventListener('keyup', (e) => {
    if (keyMap[e.key]) {
        inputState[keyMap[e.key]] = false;
        if (!charge.active && menuOverlay.classList.contains('hidden')) socket.emit('input', inputState);
    }
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && menuOverlay.classList.contains('hidden') && !lockInProgress) {
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
    setTimeout(() => {
        if (!('ontouchstart' in window)) canvas.requestPointerLock();
        lockInProgress = false;
    }, 50);
}

canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
        const scale = FIELD_WIDTH / canvas.offsetWidth;
        mousePos.x = Math.max(0, Math.min(FIELD_WIDTH, mousePos.x + e.movementX * scale));
        mousePos.y = Math.max(0, Math.min(FIELD_HEIGHT, mousePos.y + e.movementY * scale));
        if (gameState.players[myId]) {
            const angle = Math.atan2(mousePos.y - gameState.players[myId].y, mousePos.x - gameState.players[myId].x);
            socket.emit('aim', { angle, x: mousePos.x, y: mousePos.y });
        }
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas && menuOverlay.classList.contains('hidden') && !('ontouchstart' in window)) {
        canvas.requestPointerLock();
        return;
    }
    if (!charge.active) {
        charge.active = true;
        charge.type = e.button === 0 ? 'pass' : 'shoot';
        charge.start = Date.now();
        if (charge.type === 'shoot') socket.emit('input', { up: false, down: false, left: false, right: false });
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (charge.active) {
        const power = Math.min(1.0, (Date.now() - charge.start) / 1000);
        socket.emit('action', { type: charge.type, x: mousePos.x, y: mousePos.y, power });
        if (charge.type === 'shoot') socket.emit('input', inputState);
        charge.active = false;
    }
});

// --- MOBILE TOUCH LOGIC ---

let joyTouchId = null;
let joyCenter = { x: 0, y: 0 };
let lastJoyAngle = 0;

function handleJoystick(e) {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (joyTouchId === null && e.type === 'touchstart') {
            const rect = joyBase.getBoundingClientRect();
            joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            joyTouchId = t.identifier;
        }
        if (t.identifier === joyTouchId) {
            const dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const moveX = (dx / (dist || 1)) * Math.min(dist, 50), moveY = (dy / (dist || 1)) * Math.min(dist, 50);
            joyKnob.style.transform = `translate(${moveX}px, ${moveY}px)`;

            inputState.up = dy < -20; inputState.down = dy > 20;
            inputState.left = dx < -20; inputState.right = dx > 20;

            if (dist > 10) {
                lastJoyAngle = Math.atan2(dy, dx);
                const p = gameState.players[myId];
                if (p) {
                    const aimX = p.x + Math.cos(lastJoyAngle) * 200, aimY = p.y + Math.sin(lastJoyAngle) * 200;
                    mousePos.x = aimX; mousePos.y = aimY;
                    socket.emit('aim', { angle: lastJoyAngle, x: aimX, y: aimY });
                }
            }
            if (menuOverlay.classList.contains('hidden')) socket.emit('input', inputState);
        }
    }
}

function stopJoystick(e) {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === joyTouchId) {
            joyTouchId = null;
            joyKnob.style.transform = `translate(0,0)`;
            inputState.up = inputState.down = inputState.left = inputState.right = false;
            socket.emit('input', inputState);
        }
    }
}

joyBase.addEventListener('touchstart', handleJoystick);
joyBase.addEventListener('touchmove', e => { e.preventDefault(); handleJoystick(e); }, { passive: false });
joyBase.addEventListener('touchend', stopJoystick);
joyBase.addEventListener('touchcancel', stopJoystick);

btnShoot.addEventListener('touchstart', e => { e.preventDefault(); startMobileAction('shoot'); });
btnShoot.addEventListener('touchend', endMobileAction);
btnPass.addEventListener('touchstart', e => { e.preventDefault(); startMobileAction('pass'); });
btnPass.addEventListener('touchend', endMobileAction);

function startMobileAction(type) {
    charge.active = true; charge.type = type; charge.start = Date.now();
    if (type === 'shoot') socket.emit('input', { up: false, down: false, left: false, right: false });
}

function endMobileAction() {
    if (charge.active) {
        const power = Math.min(1.0, (Date.now() - charge.start) / 1000);
        socket.emit('action', { type: charge.type, x: mousePos.x, y: mousePos.y, power });
        if (charge.type === 'shoot') socket.emit('input', inputState);
        charge.active = false;
    }
}

// --- RENDERING & SCALE ---

function resize() {
    const w = window.innerWidth, h = window.innerHeight, ratio = FIELD_WIDTH / FIELD_HEIGHT;
    let newW, newH;
    if (w / h > ratio) { newH = h; newW = h * ratio; } else { newW = w; newH = w / ratio; }
    canvas.style.width = newW + 'px'; canvas.style.height = newH + 'px';
    vfxCanvas.style.width = newW + 'px'; vfxCanvas.style.height = newH + 'px';
    canvas.width = 1300; canvas.height = 900;
    vfxCanvas.width = 1300; vfxCanvas.height = 900;
}
window.addEventListener('resize', resize);
resize();

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.vx = (Math.random() - 0.5) * 15; this.vy = (Math.random() - 0.5) * 15;
        this.alpha = 1; this.life = 0.005 + Math.random() * 0.015; this.size = 2 + Math.random() * 6;
    }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= this.life; this.vx *= 0.96; this.vy *= 0.96; this.size *= 0.98; }
}
let particles = [], ballHistory = [];

function render() {
    try {
        const scale = canvas.width / FIELD_WIDTH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);

        const xM = PITCH_MARGIN * scale, yM = PITCH_MARGIN * scale, pW = PLAYABLE_WIDTH * scale, pH = PLAYABLE_HEIGHT * scale;
        ctx.save(); ctx.beginPath(); ctx.rect(xM, yM, pW, pH); ctx.clip();
        for (let i = 0; i < PLAYABLE_WIDTH; i += 75) {
            ctx.fillStyle = (Math.floor(i / 75)) % 2 === 0 ? '#1b4d1b' : '#235c23';
            ctx.fillRect(xM + (i * scale), yM, 75 * scale, pH);
        }
        ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.3 * scale;
        for (let k = 0; k < 600; k++) {
            const gx = xM + (k * 137.5 % 1) * pW, gy = yM + (k * 154.3 % 1) * pH;
            ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + (2 + k % 3) * scale); ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4 * scale; ctx.strokeRect(xM, yM, pW, pH);
        ctx.lineWidth = 3 * scale; const cR = 25 * scale;
        ctx.beginPath(); ctx.arc(xM, yM, cR, 0, Math.PI / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(xM + pW, yM, cR, Math.PI / 2, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(xM, yM + pH, cR, -Math.PI / 2, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(xM + pW, yM + pH, cR, Math.PI, -Math.PI / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(canvas.width / 2, yM); ctx.lineTo(canvas.width / 2, yM + pH); ctx.stroke();
        ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 90 * scale, 0, Math.PI * 2); ctx.stroke();

        function drawGoal(x, isLeft) {
            const w = (isLeft ? netWobble.left : netWobble.right) * Math.sin(Date.now() * 0.02) * 20 * scale, gH = 250 * scale, gY = (canvas.height - gH) / 2;
            ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1 * scale;
            for (let j = 0; j <= gH; j += 12 * scale) {
                ctx.beginPath(); ctx.moveTo(x, gY + j);
                ctx.bezierCurveTo(x + (isLeft ? -35 - w : 35 + w), gY + j, x + (isLeft ? -35 - w : 35 + w), gY + j, x + (isLeft ? -35 : 35), gY + j); ctx.stroke();
            }
            ctx.restore();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 8 * scale; ctx.lineCap = 'round';
            ctx.beginPath();
            if (isLeft) { ctx.moveTo(x, gY); ctx.lineTo(x - 25 * scale, gY); ctx.lineTo(x - 25 * scale, gY + gH); ctx.lineTo(x, gY + gH); }
            else { ctx.moveTo(x, gY); ctx.lineTo(x + 25 * scale, gY); ctx.lineTo(x + 25 * scale, gY + gH); ctx.lineTo(x, gY + gH); }
            ctx.stroke();
        }
        drawGoal(xM, true); drawGoal(xM + pW, false);
        netWobble.left *= 0.94; netWobble.right *= 0.94;

        for (const id in gameState.players) {
            const p = gameState.players[id], px = p.x * scale, py = p.y * scale;
            const teamColor = p.team === 1 ? '#00f2ff' : '#ff00c8';
            const jerseyColor = p.team === 1 ? '#0077ff' : '#9900aa';

            // 1. Dynamic Drop Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(px + 4 * scale, py + 8 * scale, 24 * scale, 10 * scale, 0, 0, Math.PI * 2); ctx.fill();

            // 2. Neon Halo (Outer Glow)
            ctx.save();
            ctx.translate(px, py);

            ctx.shadowBlur = 20 * scale; ctx.shadowColor = teamColor;
            ctx.strokeStyle = teamColor;
            ctx.lineWidth = 3 * scale;
            ctx.beginPath(); ctx.arc(0, 0, 24 * scale, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 0;

            // 3. Inner Circle (Jersey Gradient)
            const pGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 22 * scale);
            pGrad.addColorStop(0, teamColor);
            pGrad.addColorStop(1, jerseyColor);
            ctx.fillStyle = pGrad;
            ctx.beginPath(); ctx.arc(0, 0, 22 * scale, 0, Math.PI * 2); ctx.fill();

            // 4. Center Dot (Visual Focus)
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath(); ctx.arc(0, 0, 6 * scale, 0, Math.PI * 2); ctx.fill();

            // 5. Possession Indicator
            if (gameState.ball.possessor === id) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2 * scale;
                ctx.setLineDash([4 * scale, 4 * scale]);
                ctx.beginPath(); ctx.arc(0, 0, 32 * scale, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();

            // Player Name
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${15 * scale}px Outfit`;
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4 * scale; ctx.shadowColor = '#000';
            ctx.fillText(p.name.toUpperCase(), px, py - 45 * scale);
            ctx.shadowBlur = 0;

            // Power Bar
            if (id === myId && charge.active) {
                const bW = 80 * scale, bH = 6 * scale;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.roundRect(px - bW / 2, py - 65 * scale, bW, bH, 3 * scale); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.roundRect(px - bW / 2, py - 65 * scale, bW * Math.min(1, (Date.now() - charge.start) / 1000), bH, 3 * scale); ctx.fill();
            }
        }

        // --- 5. PROCEDURAL REALISTIC SOCCER BALL ---
        const bx = gameState.ball.x * scale, by = gameState.ball.y * scale, br = 15 * scale;

        ctx.save();
        ctx.translate(bx, by);

        // Dynamic Drop Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.arc(4 * scale, 4 * scale, br, 0, Math.PI * 2); ctx.fill();

        // Roll Rotation logic
        const rollSpeed = (gameState.ball.vx + gameState.ball.vy) * 0.05;
        const ballRot = (Date.now() * 0.002) + rollSpeed;
        ctx.rotate(ballRot);

        // Ball Base (3D Sphere Gradient)
        const ballGrad = ctx.createRadialGradient(-br * 0.3, -br * 0.3, br * 0.1, 0, 0, br);
        ballGrad.addColorStop(0, '#ffffff'); // Light point
        ballGrad.addColorStop(0.7, '#f0f0f0');
        ballGrad.addColorStop(1, '#cccccc'); // Edge shadow
        ctx.fillStyle = ballGrad;
        ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill();

        // Realistic Pentagon/Hexagon Pattern (Procedural)
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1 * scale;

        // Draw 6 surrounding pentagons
        for (let i = 0; i < 6; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI * 2) / 6);
            ctx.translate(br * 0.65, 0);

            ctx.fillStyle = '#111'; // Black panels
            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
                const a = (j * Math.PI * 2) / 5;
                const r = br * 0.35;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Draw connecting lines for hexagons
            ctx.beginPath();
            ctx.moveTo(0, 0);
            const lineAngle = (i * Math.PI * 2) / 6 + Math.PI / 6;
            ctx.lineTo(Math.cos(lineAngle) * br, Math.sin(lineAngle) * br);
            ctx.stroke();
        }

        // Center Pentagon
        ctx.fillStyle = '#111';
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
            const a = (j * Math.PI * 2) / 5 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * br * 0.35, Math.sin(a) * br * 0.35);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Final Shine Overlay for 3D realism
        const shineGrad = ctx.createRadialGradient(-br * 0.4, -br * 0.4, 0, -br * 0.4, -br * 0.4, br * 0.8);
        shineGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrad;
        ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill();

        ctx.restore();

        // Mouse Cursor (Mobile/PC Friendly)
        if (!('ontouchstart' in window) && document.pointerLockElement === canvas) {
            const mx = mousePos.x * scale, my = mousePos.y * scale;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * scale;
            ctx.beginPath(); ctx.arc(mx, my, 10 * scale, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(mx - 15 * scale, my); ctx.lineTo(mx + 15 * scale, my);
            ctx.moveTo(mx, my - 15 * scale); ctx.lineTo(mx, my + 15 * scale); ctx.stroke();
        }
    } catch (e) { console.error(e); }

    vfxCtx.clearRect(0, 0, vfxCanvas.width, vfxCanvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.update(); if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        vfxCtx.globalAlpha = p.alpha; vfxCtx.fillStyle = p.color;
        vfxCtx.beginPath(); vfxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2); vfxCtx.fill();
    }
    requestAnimationFrame(render);
}
render();

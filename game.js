// =============================================================================
// TRAFFIC : CORRUPT COP
// 2D top-down intersection. Tap to fire a random weapon.
// 10 car explosions = nuclear ending cutscene.
// =============================================================================

const CVS   = document.getElementById("game");
const CTX   = CVS.getContext("2d");
const W     = CVS.width;
const H     = CVS.height;
const C     = W/2;

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
let state = "menu";          // menu | playing | ending | gameOver
let kills   = 0;
let fireCooldown = 0;
const FIRE_COOLDOWN = 6;     // frames between shots

// ---------------------------------------------------------------------------
// AUDIO (simple beeps using Web Audio API)
// ---------------------------------------------------------------------------
let muted = false;
let audioCtx = null;

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e) {}
}

function playBeep(freq = 440, duration = 0.05, type = 'sine') {
  if (muted || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function playShot() { playBeep(800, 0.03, 'sine'); }
function playExpl() { 
  playBeep(200, 0.1, 'sawtooth');
  setTimeout(() => playBeep(150, 0.1, 'sawtooth'), 30);
}
function playLaser() { playBeep(1200, 0.08, 'square'); }
function playNuke() { 
  playBeep(300, 0.3, 'sawtooth');
  setTimeout(() => playBeep(200, 0.4, 'sawtooth'), 50);
}

// ---------------------------------------------------------------------------
// WEAPONS (10 total)
// ---------------------------------------------------------------------------
const WEAPONS = [
  // Normal 5
  { id:"sniper",   name:"Sniper",   radius:200,  power:0.8,  color:"#ffffff",  extreme:false, sfx:playShot },
  { id:"shotgun",  name:"Shotgun",  radius:120,  power:0.9,  color:"#ffaa44",  extreme:false, sfx:playShot },
  { id:"bazooka",  name:"Bazooka",  radius:250,  power:1.0,  color:"#ff6622",  extreme:false, sfx:playShot },
  { id:"grenade",  name:"Grenade",  radius:100,  power:1.0,  color:"#44ff44",  extreme:false, sfx:playShot },
  { id:"c4",       name:"C4",        radius:80,   power:1.0,  color:"#ff3366",  extreme:false, sfx:playShot },
  // Extreme 5
  { id:"laser",    name:"Fucking Laser", radius:9999, power:0.5,  color:"#00ffff",  extreme:true,  sfx:playLaser },
  { id:"meteor",   name:"Meteor",    radius:400,  power:1.0,  color:"#ff4400",  extreme:true,  sfx:playShot },
  { id:"hammer",   name:"Hammer of God", radius:9999, power:1.0,  color:"#ffff00",  extreme:true,  sfx:playShot },
  { id:"russ",     name:"RUSS",      radius:9999, power:1.0,  color:"#ff0044",  extreme:true,  sfx:playShot },
  { id:"nuke",     name:"Nuclear Bomb", radius:9999, power:1.0,  color:"#ff00aa",  extreme:true,  sfx:playNuke }
];

// Progressive weighting: early shots favor normal, later favor extreme
function pickWeapon(progress) {
  const normal  = WEAPONS.slice(0,5);
  const extreme = WEAPONS.slice(5);
  const r = Math.random();
  const t = Math.min(0.9, progress * 1.5); // 0->0.9 as kills go 0->10
  return r < (1-t) ? normal[Math.floor(Math.random()*normal.length)]
                       : extreme[Math.floor(Math.random()*extreme.length)];
}

// ---------------------------------------------------------------------------
// ROAD & INTERSECTION
// ---------------------------------------------------------------------------
const ROAD_W   = 180;
const ROAD_GAP = 40;
const CENTER   = { x: C, y: C };

// Lane centers for each direction
const LANES = {
  N: { x: C,      y: ROAD_GAP/2 + ROAD_W/2,     dir: { x:0, y:1 },   spawnY: -60,   spawnX: C },
  S: { x: C,      y: H - ROAD_GAP/2 - ROAD_W/2, dir: { x:0, y:-1 },  spawnY: H+60,  spawnX: C },
  E: { x: W - ROAD_GAP/2 - ROAD_W/2, y: C,      dir: { x:-1, y:0 },   spawnY: C,     spawnX: W+60 },
  W: { x: ROAD_GAP/2 + ROAD_W/2,     y: C,      dir: { x:1,  y:0 },   spawnY: C,     spawnX: -60 }
};

// ---------------------------------------------------------------------------
// TRAFFIC LIGHT STATE
// ---------------------------------------------------------------------------
let lightNS = "green";   // green | yellow | red
let lightEW = "red";
let lightTimer = 0;
const LIGHT_DUR = 180;    // ~3 sec at 60fps

function updateLights() {
  lightTimer--;
  if (lightTimer <= 0) {
    lightTimer = LIGHT_DUR;
    if (lightNS === "green") { lightNS = "yellow"; lightEW = "yellow"; }
    else if (lightNS === "yellow") { lightNS = "red"; lightEW = "green"; }
    else if (lightNS === "red") { lightNS = "green"; lightEW = "red"; }
  }
}

function isGreen(dir) {
  return (dir === "N" || dir === "S") ? lightNS === "green" : lightEW === "green";
}

// ---------------------------------------------------------------------------
// CAR
// ---------------------------------------------------------------------------
const cars = [];
const CAR_W = 28;
const CAR_H = 48;
const MAX_SPEED = 2.5;
const MIN_SPEED = 0.8;

function spawnCar() {
  if (state !== "playing") return;
  if (Math.random() < 0.03 && cars.length < 20) {
    const dirs = ["N","S","E","W"];
    const dir = dirs[Math.floor(Math.random()*dirs.length)];
    const lane = LANES[dir];
    
    // 10% chance to be unlawful (red tint)
    const unlawful = Math.random() < 0.10;
    
    // Random color for lawful cars
    const colors = ["#4488ff", "#ff8844", "#44ff88", "#ff44ff", "#8844ff", "#ffff44", "#44ffff"];
    const carColor = unlawful ? "#ff5d45" : colors[Math.floor(Math.random()*colors.length)];
    
    cars.push({
      x: lane.spawnX,
      y: lane.spawnY,
      dir: dir,
      dx: lane.dir.x * (MIN_SPEED + Math.random()*(MAX_SPEED-MIN_SPEED)),
      dy: lane.dir.y * (MIN_SPEED + Math.random()*(MAX_SPEED-MIN_SPEED)),
      w: CAR_W,
      h: CAR_H,
      color: carColor,
      unlawful: unlawful,
      exploded: false,
      hit: false,
      hitTimer: 0,
      angle: 0
    });
  }
}

function updateCars() {
  for (let i = cars.length-1; i >= 0; i--) {
    const car = cars[i];
    
    // Remove exploded cars after animation
    if (car.exploded) {
      car.hitTimer--;
      if (car.hitTimer <= 0) {
        cars.splice(i,1);
      }
      continue;
    }
    
    // Move car
    car.x += car.dx;
    car.y += car.dy;
    
    // Check if car ran a red light (unlawful behavior)
    const inIntersection = 
      car.x > C - ROAD_W/2 && car.x < C + ROAD_W/2 &&
      car.y > C - ROAD_W/2 && car.y < C + ROAD_W/2;
    
    if (inIntersection && !isGreen(car.dir) && !car.unlawful) {
      car.unlawful = true;
      car.color = "#ff5d45";
    }
    
    // Remove cars that are far off-screen
    if (car.x < -100 || car.x > W+100 || car.y < -100 || car.y > H+100) {
      cars.splice(i,1);
    }
    
    // Decrease hit timer
    if (car.hit) {
      car.hitTimer--;
      if (car.hitTimer <= 0) car.hit = false;
    }
  }
}

// ---------------------------------------------------------------------------
// PROJECTILES / WEAPON EFFECTS
// ---------------------------------------------------------------------------
const projectiles = [];
const explosions = [];

function fireWeapon(x, y) {
  if (fireCooldown > 0 || state !== "playing") return;
  fireCooldown = FIRE_COOLDOWN;
  
  const progress = kills / 10;
  const weapon = pickWeapon(progress);
  
  weapon.sfx();
  
  // Visual flash at cursor
  projectiles.push({
    x: x,
    y: y,
    r: 5,
    maxR: weapon.radius,
    color: weapon.color,
    life: 15,
    maxLife: 15,
    weapon: weapon
  });
  
  // Check hit on cars
  for (const car of cars) {
    if (car.exploded) continue;
    
    const dx = car.x - x;
    const dy = car.y - y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Super near = explode, otherwise just affect
    if (dist < 40) {
      // Explode the car
      car.exploded = true;
      car.hitTimer = 30;
      kills++;
      
      explosions.push({
        x: car.x,
        y: car.y,
        r: 10,
        maxR: 60,
        life: 20,
        maxLife: 20
      });
      
      // Flash the HUD
      const hud = document.getElementById("hudLeft");
      hud.classList.add("hit");
      setTimeout(() => hud.classList.remove("hit"), 350);
      
      playExpl();
      
      // Check win condition
      if (kills >= 10) {
        state = "ending";
        cutsceneProgress = 0;
        setTimeout(() => { state = "gameOver"; }, 2500);
      }
      
      // If it's a nuke, trigger immediate nuclear effect
      if (weapon.id === "nuke") {
        triggerNuke();
      }
    } else if (dist < weapon.radius) {
      // Affect the car (spin, stop, etc.)
      car.hit = true;
      car.hitTimer = 60;
      car.dx = lane.dir.x * (MIN_SPEED + Math.random()*(MAX_SPEED-MIN_SPEED)) * (Math.random() > 0.5 ? 1 : -1);
      car.dy = lane.dir.y * (MIN_SPEED + Math.random()*(MAX_SPEED-MIN_SPEED)) * (Math.random() > 0.5 ? 1 : -1);
      car.x += (Math.random()-0.5)*20;
      car.y += (Math.random()-0.5)*20;
    }
  }
  
  // Update kill counter
  document.getElementById("k").textContent = String(kills).padStart(2,"0");
}

function triggerNuke() {
  // Massive explosion
  for (let i = 0; i < 5; i++) {
    explosions.push({
      x: C + (Math.random()-0.5)*200,
      y: C + (Math.random()-0.5)*200,
      r: 10,
      maxR: 200,
      life: 60,
      maxLife: 60
    });
  }
}

function updateProjectiles() {
  for (let i = projectiles.length-1; i >= 0; i--) {
    const p = projectiles[i];
    p.life--;
    p.r = p.maxR * (1 - p.life/p.maxLife);
    if (p.life <= 0) projectiles.splice(i,1);
  }
}

function updateExplosions() {
  for (let i = explosions.length-1; i >= 0; i--) {
    const e = explosions[i];
    e.life--;
    e.r = e.maxR * (1 - e.life/e.maxLife);
    if (e.life <= 0) explosions.splice(i,1);
  }
}

// ---------------------------------------------------------------------------
// ENDING CUTSCENE (2D space view + mushroom cloud)
// ---------------------------------------------------------------------------
let cutsceneProgress = 0;
const CUTSCENE_DUR = 180; // 3 seconds

function drawEnding() {
  cutsceneProgress++;
  const t = Math.min(1, cutsceneProgress / CUTSCENE_DUR);
  
  // Background: space gradient
  const grad = CTX.createRadialGradient(C, H/2, 0, C, H/2, Math.max(W,H)/2);
  grad.addColorStop(0, "#000000");
  grad.addColorStop(0.3, "#0a0a1a");
  grad.addColorStop(1, "#000033");
  CTX.fillStyle = grad;
  CTX.fillRect(0, 0, W, H);
  
  // Stars (twinkling)
  CTX.fillStyle = "#ffffff";
  const time = Date.now() * 0.001;
  for (let i = 0; i < 150; i++) {
    const x = (i * 179) % W;
    const y = (i * 137) % H;
    const s = 0.5 + Math.sin(x * 0.01 + time + i) * 0.5;
    CTX.globalAlpha = 0.3 + Math.sin(x * 0.01 + time + i * 2) * 0.2;
    CTX.fillRect(x, y, s, s);
  }
  CTX.globalAlpha = 1;
  
  // Earth (distant blue circle)
  const earthR = 80 + t * 40;
  CTX.fillStyle = "#1a3a5c";
  CTX.beginPath();
  CTX.arc(C, H - 100 - t * 50, earthR, 0, Math.PI*2);
  CTX.fill();
  
  // Atmosphere glow
  const grad2 = CTX.createRadialGradient(C, H - 100 - t * 50, earthR*0.8, C, H - 100 - t * 50, earthR*1.2);
  grad2.addColorStop(0, "rgba(100,200,255,0.3)");
  grad2.addColorStop(1, "rgba(100,200,255,0)");
  CTX.fillStyle = grad2;
  CTX.beginPath();
  CTX.arc(C, H - 100 - t * 50, earthR*1.2, 0, Math.PI*2);
  CTX.fill();
  
  // Mushroom cloud (grows from city position)
  if (t > 0.3) {
    const cloudT = (t - 0.3) / 0.7;
    const cloudY = H - 80 - cloudT * 300;
    const cloudH = 50 + cloudT * 400;
    const cloudW = 40 + cloudT * 300;
    
    // Stem
    CTX.fillStyle = "#4a3a2a";
    CTX.fillRect(C - 10, cloudY, 20, cloudH * 0.4);
    
    // Cap
    const capGrad = CTX.createRadialGradient(C, cloudY, 0, C, cloudY, cloudW/2);
    capGrad.addColorStop(0, "#ffffff");
    capGrad.addColorStop(0.7, "#e0c0a0");
    capGrad.addColorStop(1, "#a08060");
    CTX.fillStyle = capGrad;
    CTX.beginPath();
    CTX.ellipse(C, cloudY - cloudH*0.1, cloudW/2, cloudH*0.3, 0, 0, Math.PI*2);
    CTX.fill();
  }
  
  // Text
  if (t > 0.8) {
    const alpha = Math.min(1, (t - 0.8) / 0.2);
    CTX.fillStyle = `rgba(255,255,255,${alpha})`;
    CTX.font = "bold 48px monospace";
    CTX.textAlign = "center";
    CTX.fillText("Good job, i guess.", C, H/2);
    
    CTX.font = "bold 24px monospace";
    CTX.fillText("tap to clock out", C, H/2 + 40);
  }
  
  // Show restart button
  if (t >= 1) {
    document.getElementById("again").classList.add("show");
  }
}

// ---------------------------------------------------------------------------
// DRAWING
// ---------------------------------------------------------------------------
function drawRoads() {
  CTX.fillStyle = "#1a1a1a";
  
  // Vertical road (N-S)
  CTX.fillRect(C - ROAD_W/2, 0, ROAD_W, H);
  
  // Horizontal road (E-W)
  CTX.fillRect(0, C - ROAD_W/2, W, ROAD_W);
  
  // Road markings
  CTX.strokeStyle = "#444444";
  CTX.lineWidth = 2;
  
  // Vertical lines on vertical road
  for (let y = ROAD_W; y < H; y += 40) {
    CTX.beginPath();
    CTX.moveTo(C, y);
    CTX.lineTo(C, y + 20);
    CTX.stroke();
  }
  
  // Horizontal lines on horizontal road
  for (let x = ROAD_W; x < W; x += 40) {
    CTX.beginPath();
    CTX.moveTo(x, C);
    CTX.lineTo(x + 20, C);
    CTX.stroke();
  }
}

function drawTrafficLights() {
  const lightSize = 12;
  const lightGap = 6;
  
  // NS lights (left side)
  const nsX = C - ROAD_W/2 - 20;
  const nsY = C - 20;
  
  // Red
  CTX.fillStyle = lightNS === "red" ? "#ff4444" : "#331111";
  CTX.beginPath();
  CTX.arc(nsX, nsY - lightGap, lightSize/2, 0, Math.PI*2);
  CTX.fill();
  
  // Yellow
  CTX.fillStyle = lightNS === "yellow" ? "#ffff44" : "#333311";
  CTX.beginPath();
  CTX.arc(nsX, nsY, lightSize/2, 0, Math.PI*2);
  CTX.fill();
  
  // Green
  CTX.fillStyle = lightNS === "green" ? "#44ff44" : "#113311";
  CTX.beginPath();
  CTX.arc(nsX, nsY + lightGap, lightSize/2, 0, Math.PI*2);
  CTX.fill();
  
  // EW lights (top side)
  const ewX = C + ROAD_W/2 + 20;
  const ewY = C - ROAD_W/2 - 20;
  
  // Red
  CTX.fillStyle = lightEW === "red" ? "#ff4444" : "#331111";
  CTX.beginPath();
  CTX.arc(ewX, ewY, lightSize/2, 0, Math.PI*2);
  CTX.fill();
  
  // Yellow
  CTX.fillStyle = lightEW === "yellow" ? "#ffff44" : "#333311";
  CTX.beginPath();
  CTX.arc(ewX, ewY + lightGap, lightSize/2, 0, Math.PI*2);
  CTX.fill();
  
  // Green
  CTX.fillStyle = lightEW === "green" ? "#44ff44" : "#113311";
  CTX.beginPath();
  CTX.arc(ewX, ewY + lightGap*2, lightSize/2, 0, Math.PI*2);
  CTX.fill();
}

function drawCars() {
  for (const car of cars) {
    if (car.exploded) {
      // Exploded car - burning wreck
      CTX.fillStyle = "#ff4422";
      CTX.fillRect(car.x - car.w/2, car.y - car.h/2, car.w, car.h);
      // Flame effect
      CTX.fillStyle = `rgba(255, 165, 0, ${car.hitTimer/30})`;
      CTX.beginPath();
      CTX.arc(car.x, car.y - car.h/2 - 5, 5, 0, Math.PI*2);
      CTX.fill();
      continue;
    }
    
    // Draw car body
    CTX.fillStyle = car.hit ? "#ffaa00" : car.color;
    
    // Save context for rotation
    CTX.save();
    CTX.translate(car.x, car.y);
    
    // Rotate based on direction
    if (car.dir === "N") CTX.rotate(0);
    else if (car.dir === "S") CTX.rotate(Math.PI);
    else if (car.dir === "E") CTX.rotate(Math.PI/2);
    else if (car.dir === "W") CTX.rotate(-Math.PI/2);
    
    // Draw car rectangle
    CTX.fillRect(-car.w/2, -car.h/2, car.w, car.h);
    
    // Windows
    CTX.fillStyle = "#2a3a4a";
    const winW = car.w * 0.6;
    const winH = car.h * 0.4;
    CTX.fillRect(-winW/2, -car.h/2 + 5, winW, winH);
    CTX.fillRect(-winW/2, 5, winW, winH);
    
    // Headlights
    CTX.fillStyle = "#ffff88";
    if (car.dir === "N") {
      CTX.fillRect(-3, -car.h/2 - 3, 6, 6);
    } else if (car.dir === "S") {
      CTX.fillRect(-3, car.h/2, 6, 6);
    } else if (car.dir === "E") {
      CTX.fillRect(car.w/2, -3, 6, 6);
    } else if (car.dir === "W") {
      CTX.fillRect(-car.w/2 - 6, -3, 6, 6);
    }
    
    CTX.restore();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    CTX.strokeStyle = p.color;
    CTX.lineWidth = 2;
    CTX.beginPath();
    CTX.arc(p.x, p.y, p.r, 0, Math.PI*2);
    CTX.stroke();
    
    // For laser, draw a line
    if (p.weapon && p.weapon.id === "laser") {
      CTX.beginPath();
      CTX.moveTo(p.x - p.r, p.y - p.r);
      CTX.lineTo(p.x + p.r, p.y + p.r);
      CTX.moveTo(p.x - p.r, p.y + p.r);
      CTX.lineTo(p.x + p.r, p.y - p.r);
      CTX.stroke();
    }
    
    // For RUSS missile
    if (p.weapon && p.weapon.id === "russ") {
      CTX.fillStyle = "#ff0044";
      CTX.font = "bold 12px monospace";
      CTX.textAlign = "center";
      CTX.fillText("RUSS", p.x, p.y);
    }
    
    // For nuke
    if (p.weapon && p.weapon.id === "nuke") {
      CTX.fillStyle = "#ff00aa";
      CTX.font = "bold 12px monospace";
      CTX.textAlign = "center";
      CTX.fillText("NUKE", p.x, p.y);
    }
  }
}

function drawExplosions() {
  for (const e of explosions) {
    const alpha = e.life / e.maxLife;
    CTX.fillStyle = `rgba(255, 100, 0, ${alpha * 0.6})`;
    CTX.beginPath();
    CTX.arc(e.x, e.y, e.r, 0, Math.PI*2);
    CTX.fill();
    
    CTX.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
    CTX.lineWidth = 3;
    CTX.beginPath();
    CTX.arc(e.x, e.y, e.r * 0.7, 0, Math.PI*2);
    CTX.stroke();
  }
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------
function frame() {
  if (state === "menu") {
    CTX.fillStyle = "#07090c";
    CTX.fillRect(0, 0, W, H);
    return;
  }
  
  if (state === "ending" || state === "gameOver") {
    drawEnding();
    return;
  }
  
  // Clear
  CTX.fillStyle = "#20262b";
  CTX.fillRect(0, 0, W, H);
  
  // Update
  updateLights();
  spawnCar();
  updateCars();
  updateProjectiles();
  updateExplosions();
  
  if (fireCooldown > 0) fireCooldown--;
  
  // Draw
  drawRoads();
  drawTrafficLights();
  drawCars();
  drawProjectiles();
  drawExplosions();
}

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------
let mouseX = 0, mouseY = 0;

CVS.addEventListener("mousemove", e => {
  const rect = CVS.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (W / rect.width);
  mouseY = (e.clientY - rect.top) * (H / rect.height);
});

function handleTap(x, y) {
  if (state === "menu") {
    state = "playing";
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("again").classList.remove("show");
    return;
  }
  
  if (state === "gameOver") {
    resetGame();
    return;
  }
  
  fireWeapon(x, y);
}

CVS.addEventListener("click", e => {
  const rect = CVS.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);
  handleTap(x, y);
});

CVS.addEventListener("touchstart", e => {
  e.preventDefault();
  const rect = CVS.getBoundingClientRect();
  const x = (e.touches[0].clientX - rect.left) * (W / rect.width);
  const y = (e.touches[0].clientY - rect.top) * (H / rect.height);
  handleTap(x, y);
});

// Keyboard: M to mute
window.addEventListener("keydown", e => {
  if (e.key.toLowerCase() === "m") {
    muted = !muted;
    document.getElementById("mute").textContent = muted ? "SOUND OFF" : "SOUND ON";
  }
});

function resetGame() {
  state = "playing";
  kills = 0;
  fireCooldown = 0;
  cars.length = 0;
  projectiles.length = 0;
  explosions.length = 0;
  cutsceneProgress = 0;
  lightNS = "green";
  lightEW = "red";
  lightTimer = LIGHT_DUR;
  document.getElementById("k").textContent = "00";
  document.getElementById("again").classList.remove("show");
  document.getElementById("overlay").classList.add("hidden");
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
document.getElementById("again").addEventListener("click", resetGame);

// Mute button
document.getElementById("mute").addEventListener("click", () => {
  muted = !muted;
  document.getElementById("mute").textContent = muted ? "SOUND OFF" : "SOUND ON";
});

// Initialize audio
initAudio();

// Start animation
setInterval(frame, 1000/60);

// Initial state
resetGame();
state = "menu";
document.getElementById("overlay").classList.remove("hidden");

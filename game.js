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
let state = "menu";
let kills   = 0;
let fireCooldown = 0;
const FIRE_COOLDOWN = 6;

// ---------------------------------------------------------------------------
// AUDIO
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
// WEAPONS
// ---------------------------------------------------------------------------
const WEAPONS = [
  { id:"sniper",   name:"Sniper",   radius:200,  color:"#ffffff",  extreme:false, sfx:playShot },
  { id:"shotgun",  name:"Shotgun",  radius:120,  color:"#ffaa44",  extreme:false, sfx:playShot },
  { id:"bazooka",  name:"Bazooka",  radius:250,  color:"#ff6622",  extreme:false, sfx:playShot },
  { id:"grenade",  name:"Grenade",  radius:100,  color:"#44ff44",  extreme:false, sfx:playShot },
  { id:"c4",       name:"C4",        radius:80,   color:"#ff3366",  extreme:false, sfx:playShot },
  { id:"laser",    name:"Fucking Laser", radius:9999, color:"#00ffff",  extreme:true,  sfx:playLaser },
  { id:"meteor",   name:"Meteor",    radius:400,  color:"#ff4400",  extreme:true,  sfx:playShot },
  { id:"hammer",   name:"Hammer of God", radius:9999, color:"#ffff00",  extreme:true,  sfx:playShot },
  { id:"russ",     name:"RUSS",      radius:9999, color:"#ff0044",  extreme:true,  sfx:playShot },
  { id:"nuke",     name:"Nuclear Bomb", radius:9999, color:"#ff00aa",  extreme:true,  sfx:playNuke }
];

function pickWeapon(progress) {
  const normal = WEAPONS.slice(0,5);
  const extreme = WEAPONS.slice(5);
  const r = Math.random();
  const t = Math.min(0.9, progress * 1.5);
  return r < (1-t) ? normal[Math.floor(Math.random()*normal.length)]
                       : extreme[Math.floor(Math.random()*extreme.length)];
}

// ---------------------------------------------------------------------------
// ROAD & INTERSECTION - CLEAN DESIGN
// ---------------------------------------------------------------------------
const ROAD_W   = 180;   // Total road width
const LANE_W   = ROAD_W / 2;  // Two lanes per road

// Cars drive on the RIGHT side of the road
// N (going south/down): right = EAST  -> x = C + LANE_W/4
// S (going north/up):   right = WEST  -> x = C - LANE_W/4  
// E (going west/left):  right = SOUTH -> y = C + LANE_W/4
// W (going east/right): right = NORTH -> y = C - LANE_W/4
const LANES = {
  N: { dir: { x: 0, y: 1 }, spawnX: C + LANE_W/4, spawnY: -80, angle: Math.PI/2, side: "east" },
  S: { dir: { x: 0, y: -1 }, spawnX: C - LANE_W/4, spawnY: H + 80, angle: Math.PI/2, side: "west" },
  E: { dir: { x: -1, y: 0 }, spawnX: W + 80, spawnY: C + LANE_W/4, angle: 0, side: "south" },
  W: { dir: { x: 1, y: 0 }, spawnX: -80, spawnY: C - LANE_W/4, angle: 0, side: "north" }
};

// ---------------------------------------------------------------------------
// TRAFFIC LIGHT STATE
// ---------------------------------------------------------------------------
let lightNS = "green";
let lightEW = "red";
let lightTimer = 180;
const LIGHT_DUR = 180;

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
// CAR - CLEAN SIMPLE GRAPHICS
// ---------------------------------------------------------------------------
const cars = [];
const CAR_W = 32;
const CAR_H = 56;
const MAX_SPEED = 3.0;
const MIN_SPEED = 1.2;

function spawnCar() {
  if (state !== "playing") return;
  if (Math.random() < 0.04 && cars.length < 35) {
    const dirs = ["N", "S", "E", "W"];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const lane = LANES[dir];
    
    const unlawful = Math.random() < 0.15;
    // Better car colors
    const colors = ["#1a3a5a", "#5a3a1a", "#1a5a3a", "#5a1a5a", "#3a1a5a", "#5a5a1a", "#1a5a5a"];
    const carColor = unlawful ? "#ff3333" : colors[Math.floor(Math.random() * colors.length)];
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    
    // Add randomness within lane
    let spawnX = lane.spawnX + (Math.random() - 0.5) * 15;
    let spawnY = lane.spawnY + (Math.random() - 0.5) * 15;
    
    cars.push({
      x: spawnX,
      y: spawnY,
      dir: dir,
      lane: lane,
      dx: lane.dir.x * speed,
      dy: lane.dir.y * speed,
      w: CAR_W,
      h: CAR_H,
      color: carColor,
      unlawful: unlawful,
      exploded: false,
      hit: false,
      hitTimer: 0
    });
  }
}

function updateCars() {
  for (let i = cars.length - 1; i >= 0; i--) {
    const car = cars[i];
    
    if (car.exploded) {
      car.hitTimer--;
      if (car.hitTimer <= 0) {
        cars.splice(i, 1);
      }
      continue;
    }
    
    car.x += car.dx;
    car.y += car.dy;
    
    // Check red light running
    const inIntersection = 
      car.x > C - ROAD_W/2 && car.x < C + ROAD_W/2 &&
      car.y > C - ROAD_W/2 && car.y < C + ROAD_W/2;
    
    if (inIntersection && !isGreen(car.dir) && !car.unlawful) {
      car.unlawful = true;
      car.color = "#ff3333";
    }
    
    // Remove off-screen cars
    if (car.x < -100 || car.x > W + 100 || car.y < -100 || car.y > H + 100) {
      cars.splice(i, 1);
    }
    
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
  
  projectiles.push({
    x: x,
    y: y,
    r: 5,
    maxR: Math.min(weapon.radius, 300),
    color: weapon.color,
    life: 15,
    maxLife: 15,
    weapon: weapon
  });
  
  for (const car of cars) {
    if (car.exploded) continue;
    
    const dx = car.x - x;
    const dy = car.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 40) {
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
      
      document.getElementById("hudLeft").classList.add("hit");
      setTimeout(() => document.getElementById("hudLeft").classList.remove("hit"), 350);
      playExpl();
      
      document.getElementById("k").textContent = String(kills).padStart(2, "0");
      
      if (kills >= 10) {
        state = "ending";
        cutsceneProgress = 0;
        setTimeout(() => {
          state = "gameOver";
          document.getElementById("again").classList.add("show");
        }, 2500);
      }
      
      if (weapon.id === "nuke") triggerNuke();
    } else if (dist < weapon.radius) {
      car.hit = true;
      car.hitTimer = 60;
      const angle = Math.atan2(dy, dx);
      const pushForce = 2.0 * (1 - dist / weapon.radius);
      car.dx = Math.cos(angle) * pushForce + car.lane.dir.x * 0.5;
      car.dy = Math.sin(angle) * pushForce + car.lane.dir.y * 0.5;
    }
  }
}

function triggerNuke() {
  for (let i = 0; i < 8; i++) {
    explosions.push({
      x: C + (Math.random() - 0.5) * 300,
      y: C + (Math.random() - 0.5) * 300,
      r: 10,
      maxR: 250,
      life: 80,
      maxLife: 80
    });
  }
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life--;
    p.r = p.maxR * (1 - p.life / p.maxLife);
    if (p.life <= 0) projectiles.splice(i, 1);
  }
}

function updateExplosions() {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life--;
    e.r = e.maxR * (1 - e.life / e.maxLife);
    if (e.life <= 0) explosions.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// ENDING CUTSCENE
// ---------------------------------------------------------------------------
let cutsceneProgress = 0;
const CUTSCENE_DUR = 180;

function drawEnding() {
  cutsceneProgress++;
  const t = Math.min(1, cutsceneProgress / CUTSCENE_DUR);
  
  // Space background
  const grad = CTX.createRadialGradient(C, H/2, 0, C, H/2, Math.max(W, H)/2);
  grad.addColorStop(0, "#000000");
  grad.addColorStop(0.5, "#0a0a1a");
  grad.addColorStop(1, "#000022");
  CTX.fillStyle = grad;
  CTX.fillRect(0, 0, W, H);
  
  // Stars
  CTX.fillStyle = "#ffffff";
  const time = Date.now() * 0.001;
  for (let i = 0; i < 200; i++) {
    const x = (i * 179) % W;
    const y = (i * 137) % H;
    const s = 0.5 + Math.sin(x * 0.01 + time + i) * 0.5;
    CTX.globalAlpha = 0.4 + Math.sin(x * 0.01 + time + i * 2) * 0.2;
    CTX.fillRect(x, y, s, s);
  }
  CTX.globalAlpha = 1;
  
  // Earth
  const earthR = 80 + t * 40;
  CTX.fillStyle = "#1a3a5c";
  CTX.beginPath();
  CTX.arc(C, H - 100 - t * 50, earthR, 0, Math.PI * 2);
  CTX.fill();
  
  // Atmosphere
  const grad2 = CTX.createRadialGradient(C, H - 100 - t * 50, earthR * 0.8, C, H - 100 - t * 50, earthR * 1.2);
  grad2.addColorStop(0, "rgba(100,200,255,0.4)");
  grad2.addColorStop(1, "rgba(100,200,255,0)");
  CTX.fillStyle = grad2;
  CTX.beginPath();
  CTX.arc(C, H - 100 - t * 50, earthR * 1.2, 0, Math.PI * 2);
  CTX.fill();
  
  // Mushroom cloud
  if (t > 0.3) {
    const cloudT = (t - 0.3) / 0.7;
    const cloudY = H - 80 - cloudT * 300;
    const cloudH = 50 + cloudT * 400;
    const cloudW = 40 + cloudT * 300;
    
    // Stem
    CTX.fillStyle = "#4a3a2a";
    CTX.fillRect(C - 10, cloudY, 20, cloudH * 0.4);
    
    // Cap
    const capGrad = CTX.createRadialGradient(C, cloudY, 0, C, cloudY, cloudW / 2);
    capGrad.addColorStop(0, "#ffffff");
    capGrad.addColorStop(0.7, "#e0c0a0");
    capGrad.addColorStop(1, "#a08060");
    CTX.fillStyle = capGrad;
    CTX.beginPath();
    CTX.ellipse(C, cloudY - cloudH * 0.1, cloudW / 2, cloudH * 0.3, 0, 0, Math.PI * 2);
    CTX.fill();
  }
  
  // Text
  if (t > 0.8) {
    const alpha = Math.min(1, (t - 0.8) / 0.2);
    CTX.fillStyle = `rgba(255,255,255,${alpha})`;
    CTX.font = "bold 48px monospace";
    CTX.textAlign = "center";
    CTX.fillText("Good job, i guess.", C, H / 2);
    CTX.font = "bold 24px monospace";
    CTX.fillText("tap to clock out", C, H / 2 + 40);
  }
  
  if (t >= 1) {
    document.getElementById("again").classList.add("show");
  }
}

// ---------------------------------------------------------------------------
// DRAWING - CLEAN, SIMPLE, READABLE
// ---------------------------------------------------------------------------

function drawRoads() {
  // Background (dark grass)
  CTX.fillStyle = "#111111";
  CTX.fillRect(0, 0, W, H);
  
  // Draw vertical road (North-South)
  CTX.fillStyle = "#222222";
  CTX.fillRect(C - ROAD_W/2, 0, ROAD_W, H);
  
  // Lane divider (dashed white line)
  CTX.strokeStyle = "#444444";
  CTX.lineWidth = 1;
  CTX.setLineDash([10, 8]);
  CTX.beginPath();
  CTX.moveTo(C, 0);
  CTX.lineTo(C, H);
  CTX.stroke();
  CTX.setLineDash([]);
  
  // Road edges (white lines)
  CTX.strokeStyle = "#666666";
  CTX.lineWidth = 3;
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2, 0);
  CTX.lineTo(C - ROAD_W/2, H);
  CTX.moveTo(C + ROAD_W/2, 0);
  CTX.lineTo(C + ROAD_W/2, H);
  CTX.stroke();
  
  // Draw horizontal road (East-West)
  CTX.fillStyle = "#222222";
  CTX.fillRect(0, C - ROAD_W/2, W, ROAD_W);
  
  // Lane divider
  CTX.strokeStyle = "#444444";
  CTX.lineWidth = 1;
  CTX.setLineDash([10, 8]);
  CTX.beginPath();
  CTX.moveTo(0, C);
  CTX.lineTo(W, C);
  CTX.stroke();
  CTX.setLineDash([]);
  
  // Road edges
  CTX.strokeStyle = "#666666";
  CTX.lineWidth = 3;
  CTX.beginPath();
  CTX.moveTo(0, C - ROAD_W/2);
  CTX.lineTo(W, C - ROAD_W/2);
  CTX.moveTo(0, C + ROAD_W/2);
  CTX.lineTo(W, C + ROAD_W/2);
  CTX.stroke();
  
  // Stop lines at intersection (thick white lines)
  CTX.strokeStyle = "#aaaaaa";
  CTX.lineWidth = 6;
  
  // North stop line
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2 + 20, C - ROAD_W/2 - 10);
  CTX.lineTo(C + ROAD_W/2 - 20, C - ROAD_W/2 - 10);
  CTX.stroke();
  
  // South stop line
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2 + 20, C + ROAD_W/2 + 10);
  CTX.lineTo(C + ROAD_W/2 - 20, C + ROAD_W/2 + 10);
  CTX.stroke();
  
  // East stop line
  CTX.beginPath();
  CTX.moveTo(C + ROAD_W/2 + 10, C - ROAD_W/2 + 20);
  CTX.lineTo(C + ROAD_W/2 + 10, C + ROAD_W/2 - 20);
  CTX.stroke();
  
  // West stop line
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2 - 10, C - ROAD_W/2 + 20);
  CTX.lineTo(C - ROAD_W/2 - 10, C + ROAD_W/2 - 20);
  CTX.stroke();
  
  // Crosswalk (zebra stripes)
  CTX.strokeStyle = "#888888";
  CTX.lineWidth = 4;
  
  // Horizontal stripes on vertical road
  for (let i = 0; i < 5; i++) {
    const y = C - 12 + i * 7;
    CTX.beginPath();
    CTX.moveTo(C - ROAD_W/2 + 25, y);
    CTX.lineTo(C + ROAD_W/2 - 25, y);
    CTX.stroke();
  }
  
  // Vertical stripes on horizontal road
  for (let i = 0; i < 5; i++) {
    const x = C - 12 + i * 7;
    CTX.beginPath();
    CTX.moveTo(x, C - ROAD_W/2 + 25);
    CTX.lineTo(x, C + ROAD_W/2 - 25);
    CTX.stroke();
  }
}

function drawTrafficLights() {
  const lightSize = 10;
  const lightGap = 6;
  const boxW = 14;
  const boxH = 42;
  
  function drawLight(x, y, lightState) {
    // Light box (black rectangle on pole)
    CTX.fillStyle = "#111111";
    CTX.fillRect(x - boxW/2, y - boxH, boxW, boxH);
    
    // Pole
    CTX.fillStyle = "#333333";
    CTX.fillRect(x - 2, y, 4, 30);
    
    // Lights
    const lightY = y - boxH + boxH/2 - lightGap;
    
    // Red
    CTX.fillStyle = lightState === "red" ? "#ff3333" : "#331111";
    CTX.beginPath();
    CTX.arc(x, lightY - lightGap, lightSize/2, 0, Math.PI * 2);
    CTX.fill();
    
    // Yellow
    CTX.fillStyle = lightState === "yellow" ? "#ffff33" : "#333311";
    CTX.beginPath();
    CTX.arc(x, lightY, lightSize/2, 0, Math.PI * 2);
    CTX.fill();
    
    // Green
    CTX.fillStyle = lightState === "green" ? "#33ff33" : "#113311";
    CTX.beginPath();
    CTX.arc(x, lightY + lightGap, lightSize/2, 0, Math.PI * 2);
    CTX.fill();
  }
  
  // Traffic lights at all 4 corners
  // NW corner - controls NS traffic
  drawLight(C - ROAD_W/2 - 15, C - ROAD_W/2 - 20, lightNS);
  // SW corner - controls NS traffic
  drawLight(C - ROAD_W/2 - 15, C + ROAD_W/2 + 20, lightNS);
  // NE corner - controls EW traffic
  drawLight(C + ROAD_W/2 + 15, C - ROAD_W/2 - 20, lightEW);
  // SE corner - controls EW traffic
  drawLight(C + ROAD_W/2 + 15, C + ROAD_W/2 + 20, lightEW);
}

function drawCars() {
  for (const car of cars) {
    if (car.exploded) {
      // Burning wreck
      CTX.fillStyle = "#ff4422";
      CTX.fillRect(car.x - car.w/2, car.y - car.h/2, car.w, car.h);
      CTX.fillStyle = `rgba(255, 165, 0, ${car.hitTimer/30})`;
      CTX.beginPath();
      CTX.arc(car.x, car.y - car.h/2 - 5, 6, 0, Math.PI * 2);
      CTX.fill();
      continue;
    }
    
    CTX.save();
    CTX.translate(car.x, car.y);
    CTX.rotate(car.lane.angle);
    
    // Car body - simple clean rectangle
    CTX.fillStyle = car.hit ? "#ffaa00" : car.color;
    CTX.fillRect(-car.w/2, -car.h/2, car.w, car.h);
    
    // Windshield (front)
    CTX.fillStyle = "#2a3a4a";
    CTX.fillRect(-car.w/2 + 4, -car.h/2 + 4, car.w - 8, 12);
    
    // Rear window
    CTX.fillStyle = "#2a3a4a";
    CTX.fillRect(-car.w/2 + 4, car.h/2 - 12, car.w - 8, 8);
    
    // Headlights (front) - only visible from front
    CTX.fillStyle = "#ffff88";
    CTX.fillRect(car.w/2 - 6, -car.h/2 + 4, 4, 4);
    CTX.fillRect(car.w/2 - 6, car.h/2 - 8, 4, 4);
    
    // Taillights (rear) - red
    CTX.fillStyle = "#ff2222";
    CTX.fillRect(-car.w/2 + 2, -car.h/2 + 4, 4, 4);
    CTX.fillRect(-car.w/2 + 2, car.h/2 - 8, 4, 4);
    
    // Wheels
    CTX.fillStyle = "#1a1a1a";
    const wheelR = 5;
    CTX.beginPath();
    CTX.arc(-car.w/2 + 8, car.h/2 - 6, wheelR, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(car.w/2 - 8, car.h/2 - 6, wheelR, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-car.w/2 + 8, -car.h/2 + 6, wheelR, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(car.w/2 - 8, -car.h/2 + 6, wheelR, 0, Math.PI * 2);
    CTX.fill();
    
    // Unlawful indicator - red outline
    if (car.unlawful) {
      CTX.strokeStyle = "#ff0000";
      CTX.lineWidth = 2;
      CTX.strokeRect(-car.w/2 - 1, -car.h/2 - 1, car.w + 2, car.h + 2);
    }
    
    CTX.restore();
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    CTX.strokeStyle = p.color;
    CTX.lineWidth = 2;
    CTX.beginPath();
    CTX.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    CTX.stroke();
    
    if (p.weapon && p.weapon.id === "laser") {
      CTX.beginPath();
      CTX.moveTo(p.x - p.r, p.y - p.r);
      CTX.lineTo(p.x + p.r, p.y + p.r);
      CTX.moveTo(p.x - p.r, p.y + p.r);
      CTX.lineTo(p.x + p.r, p.y - p.r);
      CTX.stroke();
    }
    
    if (p.weapon && (p.weapon.id === "russ" || p.weapon.id === "nuke" || p.weapon.id === "meteor")) {
      CTX.fillStyle = p.color;
      CTX.font = "bold 12px monospace";
      CTX.textAlign = "center";
      CTX.fillText(p.weapon.id.toUpperCase(), p.x, p.y);
    }
  }
}

function drawExplosions() {
  for (const e of explosions) {
    const alpha = e.life / e.maxLife;
    CTX.fillStyle = `rgba(255, 100, 0, ${alpha * 0.7})`;
    CTX.beginPath();
    CTX.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    CTX.fill();
    
    CTX.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
    CTX.lineWidth = 2;
    CTX.beginPath();
    CTX.arc(e.x, e.y, e.r * 0.7, 0, Math.PI * 2);
    CTX.stroke();
  }
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------
function frame() {
  if (state !== "ending" && state !== "gameOver") {
    CTX.fillStyle = "#111111";
    CTX.fillRect(0, 0, W, H);
  }
  
  if (state === "menu") {
    CTX.fillStyle = "#07090c";
    CTX.fillRect(0, 0, W, H);
    return;
  }
  
  if (state === "ending" || state === "gameOver") {
    drawEnding();
    return;
  }
  
  updateLights();
  spawnCar();
  updateCars();
  updateProjectiles();
  updateExplosions();
  
  if (fireCooldown > 0) fireCooldown--;
  
  drawRoads();
  drawTrafficLights();
  drawCars();
  drawProjectiles();
  drawExplosions();
}

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------
function startGame() {
  if (state === "menu") {
    state = "playing";
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("again").classList.remove("show");
  }
}

function handleTap(x, y) {
  if (state === "menu") {
    startGame();
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
document.getElementById("mute").addEventListener("click", () => {
  muted = !muted;
  document.getElementById("mute").textContent = muted ? "SOUND OFF" : "SOUND ON";
});

initAudio();
setInterval(frame, 1000/60);

resetGame();
state = "menu";
document.getElementById("overlay").classList.remove("hidden");

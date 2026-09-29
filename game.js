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
// ROAD & INTERSECTION - PROPER 4-WAY WITH LANES
// ---------------------------------------------------------------------------
const ROAD_W   = 180;   // Total road width
const LANE_W   = ROAD_W / 2;  // Each direction has 2 lanes
const CURB_W   = 20;    // Sidewalk/curb width

// Lane definitions - cars drive on the RIGHT side
// N: going DOWN (south) -> right side = EAST  -> x = C + LANE_W/2
// S: going UP (north)   -> right side = WEST  -> x = C - LANE_W/2
// E: going LEFT (west)  -> right side = SOUTH -> y = C + LANE_W/2
// W: going RIGHT (east) -> right side = NORTH -> y = C - LANE_W/2
const LANES = {
  N: {
    dir: { x: 0, y: 1 },      // Direction vector: down
    spawnX: C + LANE_W/4,    // Start on right side (east)
    spawnY: -80,
    angle: Math.PI/2,        // Car rotation: pointing down
    laneOffset: LANE_W/4     // Offset from center to right lane
  },
  S: {
    dir: { x: 0, y: -1 },     // Direction vector: up
    spawnX: C - LANE_W/4,    // Start on right side (west)
    spawnY: H + 80,
    angle: Math.PI/2,        // Car rotation: pointing down (will be flipped by dir)
    laneOffset: -LANE_W/4
  },
  E: {
    dir: { x: -1, y: 0 },     // Direction vector: left
    spawnX: W + 80,
    spawnY: C + LANE_W/4,    // Start on right side (south)
    angle: 0,                // Car rotation: pointing right
    laneOffset: -LANE_W/4
  },
  W: {
    dir: { x: 1, y: 0 },      // Direction vector: right
    spawnX: -80,
    spawnY: C - LANE_W/4,    // Start on right side (north)
    angle: 0,                // Car rotation: pointing right
    laneOffset: LANE_W/4
  }
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
// CAR - BETTER GRAPHICS AND PROPER LANE POSITIONING
// ---------------------------------------------------------------------------
const cars = [];
const CAR_W = 36;
const CAR_H = 64;
const MAX_SPEED = 3.0;
const MIN_SPEED = 1.2;

function spawnCar() {
  if (state !== "playing") return;
  if (Math.random() < 0.04 && cars.length < 35) {
    const dirs = ["N", "S", "E", "W"];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const lane = LANES[dir];
    
    const unlawful = Math.random() < 0.15;
    const colors = ["#2a4b8d", "#8d4b2a", "#2a8d4b", "#8d2a8d", "#4b2a8d", "#8d8d2a", "#2a8d8d"];
    const carColor = unlawful ? "#ff3333" : colors[Math.floor(Math.random() * colors.length)];
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    
    // Position cars in their proper lane
    let spawnX = lane.spawnX;
    let spawnY = lane.spawnY;
    
    // Add some randomness within the lane
    if (dir === "N" || dir === "S") {
      spawnX += (Math.random() - 0.5) * 20;
    } else {
      spawnY += (Math.random() - 0.5) * 20;
    }
    
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
    
    // Move car
    car.x += car.dx;
    car.y += car.dy;
    
    // Check if car ran a red light
    const inIntersection = 
      car.x > C - ROAD_W/2 && car.x < C + ROAD_W/2 &&
      car.y > C - ROAD_W/2 && car.y < C + ROAD_W/2;
    
    if (inIntersection && !isGreen(car.dir) && !car.unlawful) {
      car.unlawful = true;
      car.color = "#ff3333";
    }
    
    // Remove cars that are far off-screen
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
  
  const grad = CTX.createRadialGradient(C, H/2, 0, C, H/2, Math.max(W, H)/2);
  grad.addColorStop(0, "#000000");
  grad.addColorStop(0.3, "#0a0a1a");
  grad.addColorStop(1, "#000033");
  CTX.fillStyle = grad;
  CTX.fillRect(0, 0, W, H);
  
  const time = Date.now() * 0.001;
  CTX.fillStyle = "#ffffff";
  for (let i = 0; i < 200; i++) {
    const x = (i * 179) % W;
    const y = (i * 137) % H;
    const s = 0.5 + Math.sin(x * 0.01 + time + i) * 0.5;
    CTX.globalAlpha = 0.3 + Math.sin(x * 0.01 + time + i * 2) * 0.2;
    CTX.fillRect(x, y, s, s);
  }
  CTX.globalAlpha = 1;
  
  const earthR = 80 + t * 40;
  CTX.fillStyle = "#1a3a5c";
  CTX.beginPath();
  CTX.arc(C, H - 100 - t * 50, earthR, 0, Math.PI * 2);
  CTX.fill();
  
  const grad2 = CTX.createRadialGradient(C, H - 100 - t * 50, earthR * 0.8, C, H - 100 - t * 50, earthR * 1.2);
  grad2.addColorStop(0, "rgba(100,200,255,0.3)");
  grad2.addColorStop(1, "rgba(100,200,255,0)");
  CTX.fillStyle = grad2;
  CTX.beginPath();
  CTX.arc(C, H - 100 - t * 50, earthR * 1.2, 0, Math.PI * 2);
  CTX.fill();
  
  if (t > 0.3) {
    const cloudT = (t - 0.3) / 0.7;
    const cloudY = H - 80 - cloudT * 300;
    const cloudH = 50 + cloudT * 400;
    const cloudW = 40 + cloudT * 300;
    
    CTX.fillStyle = "#4a3a2a";
    CTX.fillRect(C - 10, cloudY, 20, cloudH * 0.4);
    
    const capGrad = CTX.createRadialGradient(C, cloudY, 0, C, cloudY, cloudW / 2);
    capGrad.addColorStop(0, "#ffffff");
    capGrad.addColorStop(0.7, "#e0c0a0");
    capGrad.addColorStop(1, "#a08060");
    CTX.fillStyle = capGrad;
    CTX.beginPath();
    CTX.ellipse(C, cloudY - cloudH * 0.1, cloudW / 2, cloudH * 0.3, 0, 0, Math.PI * 2);
    CTX.fill();
  }
  
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
// DRAWING - COMPLETELY REDESIGNED WITH PROPER VISUALS
// ---------------------------------------------------------------------------

function drawRoads() {
  // Background (grass/sidewalk)
  CTX.fillStyle = "#1a2a1a";
  CTX.fillRect(0, 0, W, H);
  
  // Draw the two roads with proper lanes and markings
  
  // ===== VERTICAL ROAD (North-South) =====
  // Main road surface
  CTX.fillStyle = "#2a2a2a";
  CTX.fillRect(C - ROAD_W/2, 0, ROAD_W, H);
  
  // Lane dividers (dashed white lines)
  CTX.strokeStyle = "#ffffff";
  CTX.lineWidth = 2;
  CTX.setLineDash([15, 10]);
  
  // Center divider between N and S lanes
  CTX.beginPath();
  CTX.moveTo(C, 0);
  CTX.lineTo(C, H);
  CTX.stroke();
  
  CTX.setLineDash([]);
  
  // Road edges (curbs)
  CTX.strokeStyle = "#5a5a5a";
  CTX.lineWidth = 6;
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2, 0);
  CTX.lineTo(C - ROAD_W/2, H);
  CTX.moveTo(C + ROAD_W/2, 0);
  CTX.lineTo(C + ROAD_W/2, H);
  CTX.stroke();
  
  // ===== HORIZONTAL ROAD (East-West) =====
  CTX.fillStyle = "#2a2a2a";
  CTX.fillRect(0, C - ROAD_W/2, W, ROAD_W);
  
  // Lane dividers
  CTX.strokeStyle = "#ffffff";
  CTX.lineWidth = 2;
  CTX.setLineDash([15, 10]);
  CTX.beginPath();
  CTX.moveTo(0, C);
  CTX.lineTo(W, C);
  CTX.stroke();
  CTX.setLineDash([]);
  
  // Road edges
  CTX.strokeStyle = "#5a5a5a";
  CTX.lineWidth = 6;
  CTX.beginPath();
  CTX.moveTo(0, C - ROAD_W/2);
  CTX.lineTo(W, C - ROAD_W/2);
  CTX.moveTo(0, C + ROAD_W/2);
  CTX.lineTo(W, C + ROAD_W/2);
  CTX.stroke();
  
  // ===== INTERSECTION MARKINGS =====
  // Stop lines (white bars before intersection)
  CTX.strokeStyle = "#ffffff";
  CTX.lineWidth = 4;
  
  // North stop line (for N-bound traffic)
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2 + 10, C - ROAD_W/2 - 15);
  CTX.lineTo(C + ROAD_W/2 - 10, C - ROAD_W/2 - 15);
  CTX.stroke();
  
  // South stop line
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2 + 10, C + ROAD_W/2 + 15);
  CTX.lineTo(C + ROAD_W/2 - 10, C + ROAD_W/2 + 15);
  CTX.stroke();
  
  // East stop line
  CTX.beginPath();
  CTX.moveTo(C + ROAD_W/2 + 15, C - ROAD_W/2 + 10);
  CTX.lineTo(C + ROAD_W/2 + 15, C + ROAD_W/2 - 10);
  CTX.stroke();
  
  // West stop line
  CTX.beginPath();
  CTX.moveTo(C - ROAD_W/2 - 15, C - ROAD_W/2 + 10);
  CTX.lineTo(C - ROAD_W/2 - 15, C + ROAD_W/2 - 10);
  CTX.stroke();
  
  // Crosswalk (zebra stripes)
  CTX.strokeStyle = "#ffffff";
  CTX.lineWidth = 3;
  
  // Horizontal crosswalk stripes on vertical road
  for (let i = 0; i < 6; i++) {
    const y = C - 15 + i * 8;
    CTX.beginPath();
    CTX.moveTo(C - ROAD_W/2 + 20, y);
    CTX.lineTo(C + ROAD_W/2 - 20, y);
    CTX.stroke();
  }
  
  // Vertical crosswalk stripes on horizontal road
  for (let i = 0; i < 6; i++) {
    const x = C - 15 + i * 8;
    CTX.beginPath();
    CTX.moveTo(x, C - ROAD_W/2 + 20);
    CTX.lineTo(x, C + ROAD_W/2 - 20);
    CTX.stroke();
  }
}

function drawTrafficLights() {
  const lightSize = 12;
  const lightGap = 8;
  const poleWidth = 4;
  const poleHeight = 50;
  const boxW = 18;
  const boxH = 60;
  
  // Helper to draw a traffic light
  function drawLight(x, y, lightState) {
    // Pole
    CTX.fillStyle = "#444444";
    CTX.fillRect(x - poleWidth/2, y, poleWidth, poleHeight);
    
    // Light box
    CTX.fillStyle = "#222222";
    CTX.fillRect(x - boxW/2, y - boxH, boxW, boxH);
    
    // Lights
    const lightY = y - boxH + boxH/2 - lightGap;
    
    // Red
    CTX.fillStyle = lightState === "red" ? "#ff3333" : "#441111";
    CTX.beginPath();
    CTX.arc(x, lightY - lightGap, lightSize/2, 0, Math.PI * 2);
    CTX.fill();
    
    // Yellow
    CTX.fillStyle = lightState === "yellow" ? "#ffff33" : "#444411";
    CTX.beginPath();
    CTX.arc(x, lightY, lightSize/2, 0, Math.PI * 2);
    CTX.fill();
    
    // Green
    CTX.fillStyle = lightState === "green" ? "#33ff33" : "#114411";
    CTX.beginPath();
    CTX.arc(x, lightY + lightGap, lightSize/2, 0, Math.PI * 2);
    CTX.fill();
  }
  
  // NS lights control both N and S traffic
  // Top-left corner (for N-bound)
  drawLight(C - ROAD_W/2 - 15, C - ROAD_W/2 - 20, lightNS);
  // Bottom-left corner (for S-bound)
  drawLight(C - ROAD_W/2 - 15, C + ROAD_W/2 + 20, lightNS);
  
  // EW lights control both E and W traffic
  // Top-right corner (for E-bound)
  drawLight(C + ROAD_W/2 + 15, C - ROAD_W/2 - 20, lightEW);
  // Bottom-right corner (for W-bound)
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
    
    // Car body - sedan shape
    CTX.fillStyle = car.hit ? "#ffaa00" : car.color;
    
    // Main body
    CTX.beginPath();
    CTX.roundRect(-car.w/2, -car.h/2 + 4, car.w, car.h - 8, 4);
    CTX.fill();
    
    // Hood (front)
    CTX.beginPath();
    CTX.roundRect(-car.w/2 + 2, -car.h/2, car.w - 4, 8, 4);
    CTX.fill();
    
    // Trunk (rear)
    CTX.beginPath();
    CTX.roundRect(-car.w/2 + 2, car.h/2 - 4, car.w - 4, 4, 4);
    CTX.fill();
    
    // Windows
    CTX.fillStyle = "#2a3a4a";
    const winW = car.w * 0.5;
    const winH = car.h * 0.35;
    CTX.beginPath();
    CTX.roundRect(-winW/2, -car.h/2 + 8, winW, winH, 2);
    CTX.fill();
    CTX.beginPath();
    CTX.roundRect(-winW/2, -8, winW, winH, 2);
    CTX.fill();
    
    // Headlights (front)
    CTX.fillStyle = "#ffff88";
    CTX.beginPath();
    CTX.arc(car.w/2 - 6, -car.h/2 + 4, 3, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(car.w/2 - 6, car.h/2 - 8, 3, 0, Math.PI * 2);
    CTX.fill();
    
    // Taillights (rear) - red
    CTX.fillStyle = "#ff2222";
    CTX.beginPath();
    CTX.arc(-car.w/2, -car.h/2 + 4, 3, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-car.w/2, car.h/2 - 8, 3, 0, Math.PI * 2);
    CTX.fill();
    
    // Wheels
    CTX.fillStyle = "#1a1a1a";
    const wheelR = car.w * 0.15;
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
    
    // Wheel details (silver rims)
    CTX.fillStyle = "#aaaaaa";
    CTX.beginPath();
    CTX.arc(-car.w/2 + 8, car.h/2 - 6, wheelR * 0.6, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(car.w/2 - 8, car.h/2 - 6, wheelR * 0.6, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(-car.w/2 + 8, -car.h/2 + 6, wheelR * 0.6, 0, Math.PI * 2);
    CTX.fill();
    CTX.beginPath();
    CTX.arc(car.w/2 - 8, -car.h/2 + 6, wheelR * 0.6, 0, Math.PI * 2);
    CTX.fill();
    
    // Unlawful indicator - red glow
    if (car.unlawful) {
      CTX.strokeStyle = "#ff0000";
      CTX.lineWidth = 2;
      CTX.beginPath();
      CTX.roundRect(-car.w/2 - 2, -car.h/2 - 2, car.w + 4, car.h + 4, 6);
      CTX.stroke();
    }
    
    CTX.restore();
  }
}

// Add roundRect to Canvas
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + width - radius, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.lineTo(x + width, y + height - radius);
    this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.lineTo(x + radius, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();
  };
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
    
    if (p.weapon && (p.weapon.id === "russ" || p.weapon.id === "nuke" || p.weapon.id === "meteor" || p.weapon.id === "hammer")) {
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
    CTX.fillStyle = `rgba(255, 100, 0, ${alpha * 0.6})`;
    CTX.beginPath();
    CTX.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    CTX.fill();
    
    CTX.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
    CTX.lineWidth = 3;
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
    CTX.fillStyle = "#1a2a1a";
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

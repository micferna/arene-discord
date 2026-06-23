import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildArena } from './Arena.js';
import { Fighter } from './Fighter.js';
import { Input } from './Input.js';
import { AI } from './AI.js';
import { CLASSES, CLASS_LIST, COMBAT, ARENA, BUILD } from '../config.js';

export class Game {
  constructor(canvas, hud, net, user) {
    this.hud = hud;
    this.net = net;
    this.user = user;
    this.localId = user.id;

    // --- rendu ---
    // Dans l'iframe Discord (desktop), souvent peu/pas de GPU : on démarre plus bas.
    const embedded = location.hostname.includes('discordsays') ||
      new URLSearchParams(location.search).has('frame_id');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !embedded, powerPreference: 'high-performance' });
    // Qualité adaptative : on démarre raisonnable et la boucle baisse la résolution si ça rame.
    this.dpr = Math.min(devicePixelRatio || 1, embedded ? 1.0 : 1.25);
    this.dprFloor = embedded ? 0.5 : 0.7;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fpsSmooth = 60;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
    this.arena = buildArena(this.scene);

    // Environment map (reflets doux sur les materiaux metalliques) sans fichier externe.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.input = new Input(canvas);

    this.fighters = new Map(); // id -> Fighter
    this.localFighter = null;
    this.ai = null;
    this.projectiles = [];
    this.effects = [];

    // camera
    this.yaw = 0;
    this.pitch = 0.25;
    this.firstPerson = false;

    // round
    this.roundOver = false;
    this.roundTimer = 0;

    this.last = performance.now();
    this.stateAccu = 0;

    addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  _setDPR(v) {
    this.dpr = v;
    this.renderer.setPixelRatio(v);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // Coupe les ombres (dernier recours quand baisser la résolution n'a pas suffi).
  _disableShadows() {
    if (!this.renderer.shadowMap.enabled) return;
    this.renderer.shadowMap.enabled = false;
    this.scene.traverse((obj) => {
      const o = /** @type {any} */ (obj);
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.needsUpdate = true; // recompile sans ombres
    });
  }

  // Mesure le FPS réel ; si ça rame : 1) baisse la résolution, 2) coupe les ombres. Affiche les infos.
  _monitorPerf(rawDt) {
    const fpsNow = rawDt > 0 ? 1 / rawDt : 60;
    this._fpsSmooth += (fpsNow - this._fpsSmooth) * 0.1;
    this._fpsAccum += rawDt;
    this._fpsFrames++;
    if (this._fpsAccum >= 1) {
      const fps = this._fpsFrames / this._fpsAccum;
      if (fps < 48) {
        if (this.dpr > this.dprFloor) {
          this._setDPR(Math.max(this.dprFloor, Math.round((this.dpr - 0.2) * 100) / 100));
        } else if (this.renderer.shadowMap.enabled) {
          this._disableShadows();
        }
      }
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
    this.hud.setPerf(
      `${Math.round(this._fpsSmooth)} FPS · ${this.dpr.toFixed(2)}x · ` +
      `${this.renderer.shadowMap.enabled ? 'ombres' : 'sans ombres'} · build ${BUILD}`
    );
  }

  // ---------- gestion des combattants ----------
  spawnLocal(classId) {
    const cls = CLASSES[classId] || CLASS_LIST[0];
    const f = new Fighter(cls, { name: this.user.global_name || this.user.username || 'Toi', isLocal: true });
    f.id = this.localId; f.isLocal = true; f.isRemote = false; f.isAI = false;
    this.localFighter = f;
    this.fighters.set(f.id, f);
    this.scene.add(f.group);
    this.placeFighters();
    this.ensureOpponent();
    return f;
  }

  addRemote(id, name, classId) {
    if (!id || id === this.localId || this.fighters.has(id)) return;
    const cls = CLASSES[classId] || CLASS_LIST[0];
    const f = new Fighter(cls, { name: name || 'Adversaire', isLocal: false });
    f.id = id; f.isRemote = true; f.isAI = false;
    this.fighters.set(id, f);
    this.scene.add(f.group);
    this.placeFighters();
    this.ensureOpponent();
  }

  removeFighter(id) {
    const f = this.fighters.get(id);
    if (!f) return;
    this.scene.remove(f.group);
    this.fighters.delete(id);
    this.placeFighters();
    this.ensureOpponent();
  }

  addAI() {
    if (this.ai) return;
    const cls = CLASS_LIST[Math.floor(Math.random() * CLASS_LIST.length)];
    const f = new Fighter(cls, { name: '🤖 Sparring Bot', isLocal: false });
    f.id = '__ai__'; f.isAI = true; f.isRemote = false;
    this.fighters.set(f.id, f);
    this.scene.add(f.group);
    this.ai = new AI(f);
    this.placeFighters();
  }

  removeAI() {
    if (!this.ai) return;
    const f = this.fighters.get('__ai__');
    if (f) { this.scene.remove(f.group); this.fighters.delete('__ai__'); }
    this.ai = null;
    this.placeFighters();
  }

  // S'il y a un vrai adversaire en ligne -> pas de bot. Si tu es seul -> bot d'entrainement.
  ensureOpponent() {
    const remotes = [...this.fighters.values()].filter((f) => f.isRemote);
    if (remotes.length > 0 && this.ai) this.removeAI();
    if (remotes.length === 0 && !this.ai && this.localFighter) this.addAI();
  }

  placeFighters() {
    const all = [...this.fighters.values()];
    const n = all.length;
    const r = Math.min(6, this.arena.radius - 3);
    all.forEach((f, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      f.pos.set(Math.cos(a) * r, ARENA.ringHeight, Math.sin(a) * r);
      const toC = new THREE.Vector3(-f.pos.x, 0, -f.pos.z);
      if (toC.lengthSq() > 1e-4) { toC.normalize(); f.ry = Math.atan2(toC.x, toC.z); }
      f.netPos.copy(f.pos); f.netRy = f.ry;
      if (f.isLocal) this.yaw = f.ry;
    });
  }

  // ---------- helpers de deplacement (utilises par l'IA) ----------
  faceToward(f, target) {
    const d = new THREE.Vector3(target.x - f.pos.x, 0, target.z - f.pos.z);
    if (d.lengthSq() > 1e-4) f.ry = Math.atan2(d.x, d.z);
  }
  moveToward(f, target, dt, scale = 1) {
    const d = new THREE.Vector3(target.x - f.pos.x, 0, target.z - f.pos.z);
    if (d.lengthSq() < 1e-4) return;
    d.normalize();
    f.pos.add(d.multiplyScalar(f.cls.speed * scale * dt));
    f._moving = true;
    this.clampToRing(f);
  }
  strafe(f, sign, dt, scale = 0.5) {
    const right = new THREE.Vector3(Math.cos(f.ry), 0, -Math.sin(f.ry));
    f.pos.add(right.multiplyScalar(sign * f.cls.speed * scale * dt));
    f._moving = true;
    this.clampToRing(f);
  }

  clampToRing(f) {
    const maxR = this.arena.radius - 0.8;
    const r = Math.hypot(f.pos.x, f.pos.z);
    if (r > maxR) { const k = maxR / r; f.pos.x *= k; f.pos.z *= k; }
    // separation : empeche les combattants de se chevaucher
    for (const o of this.fighters.values()) {
      if (o === f) continue;
      const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = 1.4;
      if (d > 1e-3 && d < min) {
        const push = (min - d) / 2;
        f.pos.x += (dx / d) * push; f.pos.z += (dz / d) * push;
      }
    }
  }

  // Integration verticale (saut + gravite) pour les combattants locaux/IA.
  _stepVertical(f, dt) {
    if (f.airborne || f.jumpOffset > 0 || f.vy !== 0) {
      f.vy -= COMBAT.gravity * dt;
      f.jumpOffset += f.vy * dt;
      if (f.jumpOffset <= 0) { f.jumpOffset = 0; f.vy = 0; f.airborne = false; }
    }
  }

  // ---------- combat ----------
  doLight(f) {
    if (!f.alive || f.cdLight > 0 || this.roundOver) return;
    f.cdLight = f.cls.light.cd;
    // combo : enchaine si on est encore dans la fenetre
    f.comboCount = (f.comboTimer > 0 && f.comboCount < COMBAT.comboMax) ? f.comboCount + 1 : 1;
    f.comboTimer = COMBAT.comboWindow;
    const finisher = f.comboCount >= COMBAT.comboMax;
    f.setAnim(finisher ? 'kick' : 'punch');
    const mult = 1 + (f.comboCount - 1) * COMBAT.comboStep;
    this._melee(f, f.cls.light, mult, finisher);
    if (finisher) { f.comboCount = 0; f.comboTimer = 0; } // le coup final clot la chaine
  }
  doHeavy(f) {
    if (!f.alive || f.cdHeavy > 0 || this.roundOver) return;
    f.cdHeavy = f.cls.heavy.cd;
    f.comboCount = 0; f.comboTimer = 0; // le coup lourd ne s'enchaine pas
    f.setAnim('kick');
    this._melee(f, f.cls.heavy);
  }
  _melee(attacker, atk, mult = 1, finisher = false) {
    const fwd = attacker.forward();
    for (const t of this.fighters.values()) {
      if (t === attacker || !t.alive) continue;
      const to = new THREE.Vector3(t.pos.x - attacker.pos.x, 0, t.pos.z - attacker.pos.z);
      const dist = to.length();
      if (dist > atk.range + 0.6) continue;
      to.normalize();
      if (fwd.dot(to) < COMBAT.hitArc) continue; // hors du cone frontal
      const kb = finisher ? atk.kb * COMBAT.comboFinisherKb : atk.kb;
      this.landHit(attacker, t, Math.round(atk.dmg * mult), kb);
    }
  }

  doSuper(f) {
    if (!f.alive || f.energy < COMBAT.superCost || this.roundOver) return;
    f.spendSuper();
    f.comboCount = 0; f.comboTimer = 0;
    f.setAnim('super');
    const sp = f.cls.super;
    this.spawnSuperFx(f, sp);
    if (this.net) this.net.send({ t: 'super', kind: sp.kind });

    if (sp.kind === 'projectile') {
      this.spawnProjectile(f, sp);
      return;
    }
    // radial / dash : zone d'effet immediate
    for (const t of this.fighters.values()) {
      if (t === f || !t.alive) continue;
      if (sp.kind === 'dash') {
        const to = new THREE.Vector3(t.pos.x - f.pos.x, 0, t.pos.z - f.pos.z);
        const dist = to.length();
        if (dist > sp.range) continue;
        to.normalize();
        if (f.forward().dot(to) < 0.2) continue;
      } else {
        if (t.pos.distanceTo(f.pos) > sp.radius) continue;
      }
      this.landHit(f, t, sp.dmg, sp.kb);
    }
    if (sp.kind === 'dash') { f.pos.add(f.forward().multiplyScalar(2.5)); this.clampToRing(f); }
  }

  // Inflige un coup. Si la cible est un joueur distant -> on previent son client (autorite a lui).
  landHit(attacker, target, dmg, kb) {
    const dir = new THREE.Vector3(target.pos.x - attacker.pos.x, 0, target.pos.z - attacker.pos.z);
    if (dir.lengthSq() < 1e-4) dir.copy(attacker.forward());
    dir.normalize();
    attacker.addEnergy(COMBAT.energyOnHitDealt);
    if (target.isRemote) {
      if (this.net) this.net.send({ t: 'hit', target: target.id, dmg, kb, kx: dir.x, kz: dir.z });
    } else {
      this.applyDamage(target, dmg, kb, dir);
    }
  }

  applyDamage(target, dmg, kb, dir) {
    if (!target.alive) return;
    const blocking = !!target._blocking;
    const real = target.takeDamage(dmg, blocking);
    if (real <= 0) return;
    target.addEnergy(COMBAT.energyOnHitTaken);
    const push = blocking ? kb * 0.25 : kb * 0.4;
    target.pos.add(dir.clone().multiplyScalar(push));
    this.clampToRing(target);
    this.spawnHitFx(target.pos);
    if (target.isLocal) {
      this.hud.flashDamage();
      if (this.net) this.net.send({ t: 'hp', hp: target.hp, energy: target.energy, dead: !target.alive });
    }
    if (!target.alive) this.onKO(target);
  }

  // ---------- supers : projectiles & effets ----------
  spawnProjectile(owner, sp) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7a00 })
    );
    const start = owner.pos.clone(); start.y = ARENA.ringHeight + 1.6;
    start.add(owner.forward().multiplyScalar(0.9));
    m.position.copy(start);
    const light = new THREE.PointLight(0xff7a00, 2, 8); m.add(light);
    this.scene.add(m);
    this.projectiles.push({ mesh: m, dir: owner.forward(), speed: sp.speed, dmg: sp.dmg, kb: sp.kb, owner, life: 2.5 });
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.add(p.dir.clone().multiplyScalar(p.speed * dt));
      let hit = false;
      for (const t of this.fighters.values()) {
        if (t === p.owner || !t.alive) continue;
        const d = Math.hypot(t.pos.x - p.mesh.position.x, t.pos.z - p.mesh.position.z);
        if (d < 1.0) { this.landHit(p.owner, t, p.dmg, p.kb); hit = true; break; }
      }
      const outOfRing = Math.hypot(p.mesh.position.x, p.mesh.position.z) > this.arena.radius + 1;
      if (hit || p.life <= 0 || outOfRing) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  spawnHitFx(pos) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 })
    );
    m.position.set(pos.x, ARENA.ringHeight + 1.4, pos.z);
    this.scene.add(m);
    this.effects.push({ mesh: m, life: 0.25, max: 0.25, grow: 6 });
  }

  spawnSuperFx(f, sp) {
    const color = f.cls?.color ?? 0xffaa00;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.9, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.pos.x, ARENA.ringHeight + 0.05, f.pos.z);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, life: 0.6, max: 0.6, grow: (sp.radius || 6) * 2.2 });
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const k = 1 - e.life / e.max;
      const s = 1 + k * e.grow;
      e.mesh.scale.set(s, s, s);
      e.mesh.material.opacity = Math.max(0, e.life / e.max);
      if (e.life <= 0) { this.scene.remove(e.mesh); this.effects.splice(i, 1); }
    }
  }

  // ---------- rounds ----------
  onKO(loser) {
    if (this.roundOver) return;
    this.roundOver = true;
    this.roundTimer = COMBAT.roundEndDelay;
    const alive = [...this.fighters.values()].filter((x) => x.alive && x !== loser);
    const winner = alive[0];
    this.hud.announce(winner ? `🏆 ${winner.name} gagne !` : 'K.O. !', COMBAT.roundEndDelay * 1000);
    document.exitPointerLock?.();
  }

  _resetRound() {
    this.roundOver = false;
    for (const f of this.fighters.values()) f.reset();
    this.placeFighters();
    if (this.localFighter && this.net) {
      this.net.send({ t: 'hp', hp: this.localFighter.hp, energy: this.localFighter.energy, dead: false });
    }
    this.hud.announce('FIGHT !', 1000);
  }

  // ---------- reseau ----------
  handleNet(msg) {
    switch (msg.t) {
      case 'peers':
        for (const p of msg.peers) this.addRemote(p.id, p.name, p.cls);
        break;
      case 'join':
        this.addRemote(msg.id, msg.name, msg.cls);
        this.hud.announce(`${msg.name} entre dans l'arène !`, 1600);
        break;
      case 'leave':
        this.removeFighter(msg.id);
        break;
      case 'state': {
        const f = this.fighters.get(msg.id);
        if (f && f.isRemote) {
          f.netPos.set(msg.x, ARENA.ringHeight, msg.z);
          f.netRy = msg.ry;
          f._netJump = msg.y || 0;
          if (msg.anim) f.setAnim(msg.anim);
          if (typeof msg.hp === 'number') { f.hp = msg.hp; f.energy = msg.energy; f.alive = msg.hp > 0; f._refreshBar(); }
        }
        break;
      }
      case 'hit': {
        if (msg.target === this.localId && this.localFighter) {
          const dir = new THREE.Vector3(msg.kx || 0, 0, msg.kz || 0);
          if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
          this.applyDamage(this.localFighter, msg.dmg, msg.kb, dir.normalize());
        }
        break;
      }
      case 'hp': {
        const f = this.fighters.get(msg.id);
        if (f) {
          f.hp = msg.hp; f.energy = msg.energy;
          f.alive = !msg.dead && msg.hp > 0;
          f._refreshBar();
          if (msg.dead) this.onKO(f);
        }
        break;
      }
      case 'super': {
        const f = this.fighters.get(msg.id);
        if (f) { f.setAnim('super'); this.spawnSuperFx(f, { kind: msg.kind, radius: f.cls.super.radius }); }
        break;
      }
    }
  }

  // ---------- entree locale ----------
  _updateLocal(dt) {
    const f = this.localFighter;
    if (!f) return;

    const sens = 0.0024;
    this.yaw -= this.input.consumeMouseDX() * sens;
    this.pitch -= this.input.consumeMouseDY() * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 1.2);
    if (this.input.once('KeyV')) this.firstPerson = !this.firstPerson;

    if (this.roundOver || !f.alive) { f._moving = false; return; }

    f.ry = this.yaw;
    const blocking = this.input.blocking && f.dodgeT <= 0 && !f.airborne;
    f._blocking = blocking;

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mv = this.input.move;

    // --- esquive (dash avec i-frames), prioritaire ---
    if (this.input.once('ControlLeft') && f.dodgeCd <= 0 && f.dodgeT <= 0 && !blocking) {
      const d = new THREE.Vector3();
      if (mv.f || mv.r) d.add(fwd.clone().multiplyScalar(mv.f)).add(right.clone().multiplyScalar(mv.r));
      else d.copy(fwd).multiplyScalar(-1); // sans direction : esquive arriere
      f.dodgeDir.copy(d.normalize());
      f.dodgeT = COMBAT.dodgeTime;
      f.dodgeCd = COMBAT.dodgeCooldown;
      f.invuln = Math.max(f.invuln, COMBAT.dodgeIFrames);
      f.setAnim('dodge');
    }

    // --- saut ---
    if (this.input.once('Space') && !f.airborne && !blocking && f.dodgeT <= 0) {
      f.vy = COMBAT.jumpSpeed;
      f.airborne = true;
      f.setAnim('jump');
    }

    // --- deplacement ---
    let moving = false;
    if (f.dodgeT > 0) {
      f.pos.add(f.dodgeDir.clone().multiplyScalar(COMBAT.dodgeSpeed * dt));
      this.clampToRing(f);
      moving = true;
    } else if (!blocking && (mv.f || mv.r)) {
      const dir = fwd.clone().multiplyScalar(mv.f).add(right.clone().multiplyScalar(mv.r));
      if (dir.lengthSq() > 0) {
        dir.normalize();
        const spd = f.cls.speed * (f.airborne ? 0.7 : 1); // moins de controle en l'air
        f.pos.add(dir.multiplyScalar(spd * dt));
        moving = true;
        this.clampToRing(f);
      }
    }
    f._moving = moving;

    if (!blocking && f.dodgeT <= 0) {
      if (this.input.once('LightAttack') || this.input.once('KeyJ')) this.doLight(f);
      if (this.input.once('HeavyAttack') || this.input.once('KeyK')) this.doHeavy(f);
      if (this.input.once('KeyE')) this.doSuper(f);
    }
  }

  _updateCamera() {
    const f = this.localFighter;
    if (!f) return;
    const jy = f.jumpOffset;                      // la camera suit le saut
    const headY = ARENA.ringHeight + 1.95 + jy;
    if (this.firstPerson) {
      // vue boxeur : on garde le corps/les gants, on masque seulement sa propre tete
      f.group.visible = true;
      f.headGroup.visible = false;
      f.bar.sprite.visible = false;
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      this.camera.position.set(f.pos.x + fx * 0.25, ARENA.ringHeight + 1.85 + jy, f.pos.z + fz * 0.25);
      const look = new THREE.Vector3(fx * cp, sp, fz * cp);
      this.camera.lookAt(this.camera.position.x + look.x, this.camera.position.y + look.y, this.camera.position.z + look.z);
    } else {
      f.group.visible = true;
      f.headGroup.visible = true;
      f.bar.sprite.visible = true;
      const dist = 5.2;
      const elev = THREE.MathUtils.clamp(this.pitch, -0.3, 0.9);
      const ce = Math.cos(elev), se = Math.sin(elev);
      const cx = f.pos.x - Math.sin(this.yaw) * ce * dist;
      const cz = f.pos.z - Math.cos(this.yaw) * ce * dist;
      const cy = headY + se * dist + 0.4;
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(f.pos.x, headY, f.pos.z);
    }
  }

  // adversaire affiche dans le HUD = le plus proche encore en vie
  _primaryOpponent() {
    let best = null, bestD = Infinity;
    for (const f of this.fighters.values()) {
      if (f.isLocal) continue;
      const d = this.localFighter ? f.pos.distanceTo(this.localFighter.pos) : 0;
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  // ---------- boucle ----------
  start() {
    const loop = (now) => {
      const rawDt = (now - this.last) / 1000;
      const dt = Math.min(0.05, rawDt) || 0;
      this.last = now;
      this._monitorPerf(rawDt);

      // reset des drapeaux de frame
      for (const f of this.fighters.values()) { f._moving = false; f._blocking = false; }

      this._updateLocal(dt);
      if (this.ai) this.ai.update(dt, this);

      // physique verticale (saut/gravite) pour les combattants qu'on simule
      for (const f of this.fighters.values()) {
        if (!f.isRemote) this._stepVertical(f, dt);
      }

      // interpolation des combattants distants
      for (const f of this.fighters.values()) {
        if (f.isRemote) {
          const before = f.pos.clone();
          f.pos.lerp(f.netPos, Math.min(1, dt * 12));
          f.ry = lerpAngle(f.ry, f.netRy, Math.min(1, dt * 12));
          f.jumpOffset += (f._netJump - f.jumpOffset) * Math.min(1, dt * 14);
          f._moving = before.distanceTo(f.pos) > 0.01;
        }
      }

      this._updateProjectiles(dt);
      this._updateEffects(dt);

      // animations
      for (const f of this.fighters.values()) {
        f.update(dt, { moving: f._moving, blocking: f._blocking, camera: this.camera });
      }

      this._updateCamera();

      // envoi reseau (~20 Hz)
      this.stateAccu += dt;
      if (this.stateAccu > 0.05 && this.net && this.localFighter) {
        this.stateAccu = 0;
        const f = this.localFighter;
        this.net.send({ t: 'state', x: f.pos.x, z: f.pos.z, ry: f.ry, y: f.jumpOffset, anim: f.anim, hp: f.hp, energy: f.energy });
      }

      // round
      if (this.roundOver) {
        this.roundTimer -= dt;
        if (this.roundTimer <= 0) this._resetRound();
      }

      // HUD
      const opp = this._primaryOpponent();
      this.hud.setNames(this.localFighter?.name, opp?.name);
      this.hud.update(this.localFighter, opp);
      this.hud.tick(dt);

      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

import * as THREE from 'three';
import { ARENA } from '../config.js';

// Un combattant : modele humanoide (primitives), etat de combat, animations simples.
export class Fighter {
  constructor(cls, { name = 'Combattant', isLocal = false } = {}) {
    this.cls = cls;
    this.name = name;
    this.isLocal = isLocal;

    // identifiants / drapeaux pilotes par le moteur (Game)
    this.id = '';
    this.isRemote = false;
    this.isAI = false;
    this._moving = false;   // "se deplace cette frame"
    this._blocking = false; // "en garde cette frame"

    this.maxHp = cls.maxHp;
    this.hp = cls.maxHp;
    this.energy = 0;
    this.alive = true;

    this.pos = new THREE.Vector3(0, ARENA.ringHeight, 0);
    this.ry = 0;                 // orientation (radians)
    this.vel = new THREE.Vector3();
    this.invuln = 0;             // i-frames restantes (s)

    // cooldowns d'attaque
    this.cdLight = 0;
    this.cdHeavy = 0;

    // animation
    this.anim = 'idle';
    this.animT = 0;
    this.walkPhase = 0;

    // cible reseau (combattants distants) : on interpole vers ces valeurs
    this.netPos = this.pos.clone();
    this.netRy = 0;
    this._netJump = 0;

    // saut / esquive / combo
    this.jumpOffset = 0;    // hauteur au-dessus du sol (saut)
    this.vy = 0;            // vitesse verticale
    this.airborne = false;
    this.dodgeT = 0;        // dash d'esquive en cours (s restantes)
    this.dodgeCd = 0;       // recharge de l'esquive
    this.dodgeDir = new THREE.Vector3();
    this.comboCount = 0;    // longueur de la chaine de coups legers
    this.comboTimer = 0;    // fenetre restante pour enchainer

    this._build();
  }

  _build() {
    // Modele authore avec les pieds a y=0 (le group est ensuite pose a y=ringHeight).
    const g = new THREE.Group();
    const col = this.cls.color;
    const id = this.cls.id;
    const accent = lighten(col, 0.4);

    const matBody = new THREE.MeshStandardMaterial({ color: col, roughness: 0.42, metalness: 0.35 });
    const matSuit = new THREE.MeshStandardMaterial({ color: lighten(col, -0.45), roughness: 0.55, metalness: 0.25 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.5, metalness: 0.4 });
    const matSkin = new THREE.MeshStandardMaterial({ color: 0xf2c79e, roughness: 0.6, metalness: 0.0 });
    const matMetal = new THREE.MeshStandardMaterial({ color: 0xaab0c6, roughness: 0.25, metalness: 0.95 });
    const matGlow = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.6, roughness: 0.4 });
    const matTrim = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3 });

    // silhouette par classe
    const girth = id === 'titan' ? 1.22 : id === 'ninja' ? 0.86 : id === 'mage' ? 0.96 : 1.04;
    const add = (mesh, parent = g) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

    // --- bassin ---
    const hips = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * girth, 0.16, 4, 12), matSuit));
    hips.position.y = 0.98; hips.scale.z = 0.8;

    // --- torse (abdomen + buste large) ---
    const abdomen = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * girth, 0.2, 6, 14), matBody));
    abdomen.position.y = 1.22; abdomen.scale.z = 0.78;
    const chest = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.4 * girth, 0.22, 6, 16), matBody));
    chest.position.y = 1.52; chest.scale.z = 0.72;
    // pectoral/plastron lumineux
    const plate = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.26 * girth, 0.18, 4, 12), matTrim));
    plate.position.set(0, 1.5, 0.22 * girth); plate.scale.set(1, 1, 0.4);
    // ceinture
    const belt = add(new THREE.Mesh(new THREE.TorusGeometry(0.33 * girth, 0.06, 8, 20), matDark));
    belt.position.y = 1.12; belt.rotation.x = Math.PI / 2; belt.scale.z = 0.8;

    // --- epaules ---
    const shoulderY = 1.66, shoulderX = 0.42 * girth;
    for (const s of [-1, 1]) {
      const pad = add(new THREE.Mesh(new THREE.SphereGeometry((id === 'titan' ? 0.26 : 0.2) * girth, 14, 12),
        id === 'titan' ? matMetal : matBody));
      pad.position.set(s * shoulderX, shoulderY, 0);
    }

    // --- cou + tete ---
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 10), matSkin));
    neck.position.y = 1.8;
    // La tete (+ yeux + accessoires de tete) est regroupee pour pouvoir la masquer
    // seule en vue 1ere personne (on garde le corps/les gants visibles).
    const headGroup = new THREE.Group();
    g.add(headGroup);
    this.headGroup = headGroup;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 18), matSkin);
    head.position.y = 2.04; head.scale.set(0.92, 1, 0.92); head.castShadow = true;
    headGroup.add(head);
    // machoire (donne du relief au visage, moins "boule")
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), matSkin);
    jaw.position.set(0, 1.9, 0.05); jaw.scale.set(0.92, 0.72, 1); jaw.castShadow = true;
    headGroup.add(jaw);
    // yeux lumineux (regardent +Z = l'avant)
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), matGlow);
      eye.position.set(s * 0.1, 2.05, 0.22);
      headGroup.add(eye);
    }

    // --- accessoires par classe ---
    this._classAccessories(id, { g, headGroup, matDark, matMetal, matTrim, matGlow, accent });

    // --- bras (pivot epaule) : haut + avant-bras + poing/gant ---
    const makeArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * shoulderX, shoulderY, 0);
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), matSuit), pivot).position.y = -0.22;
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 10), matSkin), pivot).position.y = -0.55;
      // manchette / protege-poignet
      const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.1, 12), matTrim), pivot);
      cuff.position.y = -0.69;
      const fistR = id === 'brawler' ? 0.18 : 0.13;
      const fist = add(new THREE.Mesh(new THREE.SphereGeometry(fistR, 12, 10),
        id === 'brawler' ? new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.45, metalness: 0.1 }) : matDark), pivot);
      fist.position.y = -0.78;
      g.add(pivot);
      return pivot;
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    // --- jambes : cuisse + tibia + botte ---
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.17 * girth, 0.92, 0);
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), matSuit), pivot).position.y = -0.25;
      // genouillere
      const knee = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), matBody), pivot);
      knee.position.set(0, -0.46, 0.05); knee.scale.set(1, 0.8, 1);
      add(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), matSuit), pivot).position.y = -0.62;
      const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.17, 0.36), matDark), pivot);
      boot.position.set(0, -0.86, 0.07);
      // semelle accent
      const sole = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.38), matTrim), pivot);
      sole.position.set(0, -0.94, 0.07);
      g.add(pivot);
      return pivot;
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // aura de garde (cachee par defaut)
    this.guardAura = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 20, 16),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.16 })
    );
    this.guardAura.position.y = 1.25; this.guardAura.visible = false; g.add(this.guardAura);

    // barre de vie flottante
    this.bar = makeFloatingBar(col);
    this.bar.sprite.position.y = 2.65;
    g.add(this.bar.sprite);

    this.group = g;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.ry;
  }

  // Accessoires en coordonnees pieds-relatives (la tete est centree vers y=2.02).
  // addH = accessoire de tete (masque en vue FPS) · addB = accessoire de corps (reste visible).
  _classAccessories(id, { g, headGroup, matDark, matMetal, matTrim, matGlow, accent }) {
    const addH = (m) => { m.castShadow = true; headGroup.add(m); return m; };
    const addB = (m) => { m.castShadow = true; g.add(m); return m; };
    if (id === 'brawler') {
      const band = addH(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 8, 18), matTrim));
      band.position.y = 2.12; band.rotation.x = Math.PI / 2; band.scale.set(1.05, 1.05, 0.8);
    } else if (id === 'ninja') {
      // masque (bas du visage) + bandeau
      const mask = addH(new THREE.Mesh(new THREE.SphereGeometry(0.265, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.32), matDark));
      mask.position.y = 2.02; mask.position.z = 0.012;
      const band = addH(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 18), matGlow));
      band.position.y = 2.13; band.rotation.x = Math.PI / 2; band.scale.z = 0.8;
      // foulard a l'arriere (sur le corps)
      const tail = addB(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.04), matGlow));
      tail.position.set(0.12, 1.9, -0.28); tail.rotation.x = -0.5;
    } else if (id === 'titan') {
      // casque integral
      const helm = addH(new THREE.Mesh(new THREE.SphereGeometry(0.285, 18, 14), matMetal));
      helm.position.y = 2.04;
      const visor = addH(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.08), matGlow));
      visor.position.set(0, 2.04, 0.25);
      const crest = addH(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.32), matTrim));
      crest.position.set(0, 2.24, 0);
    } else if (id === 'mage') {
      // chapeau pointu + bord
      const brim = addH(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), matDark));
      brim.position.y = 2.2;
      const hat = addH(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 20), matTrim));
      hat.position.y = 2.5;
      const star = addH(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), matGlow));
      star.position.set(0, 2.72, 0.08);
      // robe (jupe conique sur le bas du corps)
      const robe = addB(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: lighten(accent, -0.3), roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide })));
      robe.position.y = 0.55;
    }
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.ry), 0, Math.cos(this.ry));
  }

  setAnim(name) {
    if (this.anim === name) return;
    // ne pas couper une attaque/un hit en cours par idle/move
    if ((this.anim === 'punch' || this.anim === 'kick' || this.anim === 'super' || this.anim === 'hit')
        && (name === 'idle' || name === 'move')) return;
    this.anim = name;
    this.animT = 0;
  }

  takeDamage(dmg, blocking) {
    if (!this.alive || this.invuln > 0) return 0;
    const real = Math.max(1, Math.round(blocking ? dmg * (1 - 0.75) : dmg));
    this.hp = Math.max(0, this.hp - real);
    this.invuln = 0.25;
    this.comboCount = 0; this.comboTimer = 0; // se faire toucher casse son combo
    this.setAnim('hit');
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    this._refreshBar();
    return real;
  }

  addEnergy(v) { this.energy = Math.min(100, this.energy + v); }
  spendSuper() { this.energy = 0; }

  reset() {
    this.hp = this.maxHp; this.energy = 0; this.alive = true;
    this.invuln = 0; this.vel.set(0, 0, 0);
    this.jumpOffset = 0; this.vy = 0; this.airborne = false;
    this.dodgeT = 0; this.dodgeCd = 0;
    this.comboCount = 0; this.comboTimer = 0;
    this.group.rotation.x = 0;
    this.setAnim('idle');
    this._refreshBar();
  }

  _refreshBar() { this.bar.update(this.hp / this.maxHp); }

  // --- mise a jour visuelle (anim) ---
  /**
   * @param {number} dt
   * @param {{ moving?: boolean, blocking?: boolean, camera?: import('three').Camera|null }} [opts]
   */
  update(dt, { moving = false, blocking = false, camera = null } = {}) {
    this.animT += dt;
    this.cdLight = Math.max(0, this.cdLight - dt);
    this.cdHeavy = Math.max(0, this.cdHeavy - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboCount = 0; }

    // position = sol + hauteur de saut
    this.group.position.set(this.pos.x, this.pos.y + this.jumpOffset, this.pos.z);
    this.group.rotation.y = this.ry;
    this.guardAura.visible = blocking && this.alive;

    // la barre de vie fait toujours face a la camera
    if (camera) this.bar.sprite.quaternion.copy(camera.quaternion);

    if (!this.alive) {
      // tombe au sol
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, -Math.PI / 2, dt * 6);
      return;
    }
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, dt * 8);

    const A = this.armL, B = this.armR, L = this.legL, R = this.legR;

    // anims transitoires
    if (this.anim === 'punch') {
      const p = clamp01(this.animT / 0.22);
      const swing = Math.sin(p * Math.PI);
      B.rotation.x = -swing * (Math.PI / 2);
      A.rotation.x = swing * 0.3;
      if (this.animT > 0.3) this.setAnimForce(moving ? 'move' : 'idle');
      return;
    }
    if (this.anim === 'kick') {
      const p = clamp01(this.animT / 0.3);
      const swing = Math.sin(p * Math.PI);
      R.rotation.x = -swing * (Math.PI / 2.2);
      B.rotation.x = swing * 0.4;
      if (this.animT > 0.4) this.setAnimForce(moving ? 'move' : 'idle');
      return;
    }
    if (this.anim === 'super') {
      const p = clamp01(this.animT / 0.5);
      const s = Math.sin(p * Math.PI);
      A.rotation.x = -s * 2.2; B.rotation.x = -s * 2.2;
      if (this.animT > 0.6) this.setAnimForce(moving ? 'move' : 'idle');
      return;
    }
    if (this.anim === 'hit') {
      const p = clamp01(this.animT / 0.25);
      const s = Math.sin(p * Math.PI);
      A.rotation.x = s * 0.6; B.rotation.x = s * 0.6;
      if (this.animT > 0.25) this.setAnimForce(moving ? 'move' : 'idle');
      return;
    }

    // esquive : roulade (corps penche, bras ramenes)
    if (this.dodgeT > 0) {
      A.rotation.x = THREE.MathUtils.lerp(A.rotation.x, -1.6, dt * 16);
      B.rotation.x = THREE.MathUtils.lerp(B.rotation.x, -1.6, dt * 16);
      L.rotation.x = THREE.MathUtils.lerp(L.rotation.x, -0.7, dt * 16);
      R.rotation.x = THREE.MathUtils.lerp(R.rotation.x, 0.7, dt * 16);
      return;
    }

    // en l'air : jambes repliees
    if (this.airborne) {
      L.rotation.x = THREE.MathUtils.lerp(L.rotation.x, -0.7, dt * 10);
      R.rotation.x = THREE.MathUtils.lerp(R.rotation.x, -1.1, dt * 10);
      A.rotation.x = THREE.MathUtils.lerp(A.rotation.x, -0.5, dt * 10);
      B.rotation.x = THREE.MathUtils.lerp(B.rotation.x, -0.5, dt * 10);
      return;
    }

    // garde
    if (blocking) {
      A.rotation.x = THREE.MathUtils.lerp(A.rotation.x, -2.2, dt * 12);
      B.rotation.x = THREE.MathUtils.lerp(B.rotation.x, -2.2, dt * 12);
      L.rotation.x = THREE.MathUtils.lerp(L.rotation.x, 0, dt * 10);
      R.rotation.x = THREE.MathUtils.lerp(R.rotation.x, 0, dt * 10);
      return;
    }

    // marche / idle : balancement des membres
    if (moving) {
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase) * 0.7;
      L.rotation.x = s; R.rotation.x = -s;
      A.rotation.x = -s; B.rotation.x = s;
    } else {
      const breathe = Math.sin(this.animT * 2) * 0.06;
      L.rotation.x = THREE.MathUtils.lerp(L.rotation.x, 0, dt * 8);
      R.rotation.x = THREE.MathUtils.lerp(R.rotation.x, 0, dt * 8);
      A.rotation.x = THREE.MathUtils.lerp(A.rotation.x, breathe, dt * 8);
      B.rotation.x = THREE.MathUtils.lerp(B.rotation.x, -breathe, dt * 8);
    }
  }

  setAnimForce(name) { this.anim = name; this.animT = 0; }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Eclaircit (amt>0) ou assombrit (amt<0) une couleur hex, renvoie un hex.
function lighten(hex, amt) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amt >= 0 ? 0xffffff : 0x000000), Math.abs(amt));
  return c.getHex();
}

// Barre de vie en sprite (texture canvas mise a jour quand les PV changent).
function makeFloatingBar(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 40;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.2, 0.34, 1);
  const hex = '#' + color.toString(16).padStart(6, '0');

  function update(ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    ctx.clearRect(0, 0, 256, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, 0, 8, 256, 24, 8); ctx.fill();
    const grd = ctx.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, ratio > 0.3 ? '#3bff6a' : '#ff3b3b');
    grd.addColorStop(1, ratio > 0.3 ? '#9bff3b' : '#ff7a45');
    ctx.fillStyle = grd;
    roundRect(ctx, 4, 12, Math.max(0, 248 * ratio), 16, 6); ctx.fill();
    ctx.strokeStyle = hex; ctx.lineWidth = 3;
    roundRect(ctx, 2, 9, 252, 22, 8); ctx.stroke();
    tex.needsUpdate = true;
  }
  update(1);
  return { sprite, update };
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Gestion clavier + souris (pointer lock pour orienter la camera).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;     // mouvement souris horizontal accumule (consomme chaque frame)
    this.mouseDY = 0;     // mouvement souris vertical accumule
    this.locked = false;

    // Actions "one-shot" (declenchees une fois par appui)
    this.pressed = new Set();

    addEventListener('keydown', (e) => {
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'ShiftLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    // Coups a la souris quand le pointeur est verrouille
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.pressed.add('LightAttack');
      if (e.button === 2) this.pressed.add('HeavyAttack');
    });
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  // direction de deplacement brute (avant/droite), -1..1
  get move() {
    let f = 0, r = 0;
    if (this.keys.has('KeyW')) f += 1;
    if (this.keys.has('KeyS')) f -= 1;
    if (this.keys.has('KeyD')) r += 1;
    if (this.keys.has('KeyA')) r -= 1;
    return { f, r };
  }

  get blocking() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  consumeMouseDX() { const v = this.mouseDX; this.mouseDX = 0; return v; }
  consumeMouseDY() { const v = this.mouseDY; this.mouseDY = 0; return v; }

  // true une seule fois par appui
  once(action) {
    if (this.pressed.has(action)) { this.pressed.delete(action); return true; }
    return false;
  }
  endFrame() { /* reserve si besoin */ }
}

// IA d'entrainement : fonce sur le joueur, attaque a portee, garde parfois, lache son super a 100%.
// Elle ne fait que decider : c'est le Game qui applique deplacements et coups (helpers partages).
export class AI {
  constructor(fighter) {
    this.f = fighter;
    this.think = 0;
    this.blockT = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
  }

  update(dt, game) {
    const f = this.f;
    if (!f.alive || game.roundOver) return;
    const target = game.localFighter;
    if (!target || !target.alive) return;

    game.faceToward(f, target.pos);
    const d = f.pos.distanceTo(target.pos);
    this.think -= dt;
    this.blockT -= dt;

    if (this.blockT > 0) { f._blocking = true; }

    if (d > 2.0) {
      game.moveToward(f, target.pos, dt);
    } else {
      game.strafe(f, this.strafeDir, dt, 0.45);
      if (Math.random() < 0.012) this.strafeDir *= -1;
      if (this.think <= 0) {
        this.think = 0.3 + Math.random() * 0.45;
        if (f.energy >= 100) {
          game.doSuper(f);
        } else {
          const r = Math.random();
          if (r < 0.18) this.blockT = 0.5;
          else if (r < 0.78) game.doLight(f);
          else game.doHeavy(f);
        }
      }
    }
  }
}

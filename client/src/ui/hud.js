import { CLASS_LIST } from '../config.js';

// Construit tout le HUD dans #hud et expose des methodes de mise a jour.
export class HUD {
  constructor(root) {
    root.innerHTML = `
      <div id="dmgflash"></div>
      <div class="bars left">
        <div class="name" id="p1name">—</div>
        <div class="bar hp"><div class="fill" id="p1hp"></div></div>
        <div class="bar energy" id="p1energybar"><div class="fill" id="p1energy"></div></div>
      </div>
      <div class="bars right">
        <div class="name" id="p2name">—</div>
        <div class="bar hp"><div class="fill" id="p2hp"></div></div>
        <div class="bar energy" id="p2energybar"><div class="fill" id="p2energy"></div></div>
      </div>
      <div id="announce"></div>
      <div id="combo"></div>
      <div id="controls">
        <b>ZQSD</b> bouger · <b>Souris</b> viser · <b>Clic G</b> coup · <b>Clic D</b> charge ·
        <b>Espace</b> saut · <b>Ctrl</b> esquive · <b>Maj</b> garde · <b>E</b> super · <b>V</b> vue
      </div>
      <div id="overlay"></div>
    `;
    this.$ = (id) => root.querySelector('#' + id);
    this._announceT = 0;
  }

  // --- ecran de selection de classe ---
  showClassSelect(onStart) {
    const ov = this.$('overlay');
    let selected = CLASS_LIST[0].id;
    ov.innerHTML = `
      <h1>⚔️ ARÈNE</h1>
      <div class="sub">Choisis ton combattant</div>
      <div class="classes">
        ${CLASS_LIST.map((c) => `
          <div class="class-card${c.id === selected ? ' sel' : ''}" data-id="${c.id}">
            <div class="cname" style="color:#${c.color.toString(16).padStart(6, '0')}">${c.name}</div>
            <div class="super">✦ ${c.super.name}</div>
            <div class="stats">❤️ ${c.maxHp} PV<br>🏃 vitesse ${c.speed}<br>👊 ${c.light.dmg} / 🦵 ${c.heavy.dmg}</div>
          </div>`).join('')}
      </div>
      <button class="start-btn" id="startbtn">COMBATTRE</button>
    `;
    ov.querySelectorAll('.class-card').forEach((card) => {
      card.addEventListener('click', () => {
        selected = card.dataset.id;
        ov.querySelectorAll('.class-card').forEach((c) => c.classList.remove('sel'));
        card.classList.add('sel');
      });
    });
    this.$('startbtn').addEventListener('click', () => {
      ov.classList.add('hidden');
      onStart(selected);
    });
  }

  hideOverlay() { this.$('overlay').classList.add('hidden'); }

  setNames(p1, p2) {
    this.$('p1name').textContent = p1 ?? '—';
    this.$('p2name').textContent = p2 ?? '—';
  }

  // ratios 0..1
  update(local, opp) {
    if (local) {
      this.$('p1hp').style.transform = `scaleX(${local.hp / local.maxHp})`;
      this.$('p1energy').style.transform = `scaleX(${local.energy / 100})`;
      this.$('p1energybar').classList.toggle('full', local.energy >= 100);
      // compteur de combo
      const combo = this.$('combo');
      if (local.comboCount >= 2) {
        combo.textContent = `COMBO ×${local.comboCount}`;
        combo.classList.add('show');
      } else {
        combo.classList.remove('show');
      }
    }
    if (opp) {
      this.$('p2hp').style.transform = `scaleX(${opp.hp / opp.maxHp})`;
      this.$('p2energy').style.transform = `scaleX(${opp.energy / 100})`;
      this.$('p2energybar').classList.toggle('full', opp.energy >= 100);
      this.$('p2name').style.opacity = opp.alive ? 1 : 0.4;
    }
  }

  announce(text, ms = 2500) {
    const el = this.$('announce');
    el.textContent = text;
    el.classList.add('show');
    this._announceT = ms / 1000;
  }

  flashDamage() {
    const f = this.$('dmgflash');
    f.style.background = 'rgba(255,0,0,0.35)';
    setTimeout(() => { f.style.background = 'rgba(255,0,0,0)'; }, 90);
  }

  tick(dt) {
    if (this._announceT > 0) {
      this._announceT -= dt;
      if (this._announceT <= 0) this.$('announce').classList.remove('show');
    }
  }
}

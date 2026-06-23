// Equilibrage & classes. Tout se regle ici.

// Identifiant de build affiche a l'ecran (sert a verifier qu'on tourne bien la derniere version).
export const BUILD = 'perf2';

export const ARENA = {
  radius: 14,        // rayon du ring (les combattants sont clampes a l'interieur)
  ringHeight: 1,     // hauteur de la plateforme
};

export const COMBAT = {
  energyOnHitDealt: 12,   // energie gagnee quand on touche
  energyOnHitTaken: 8,    // energie gagnee quand on encaisse
  superCost: 100,
  blockReduction: 0.75,   // -75% de degats en garde
  hitArc: 0.35,           // produit scalaire mini (cone frontal) pour qu'un coup touche
  invulnAfterHit: 0.25,   // i-frames apres avoir ete touche (s)
  roundEndDelay: 3.0,     // s avant respawn apres un KO

  // --- Saut ---
  jumpSpeed: 8.0,         // vitesse verticale initiale du saut
  gravity: 22,            // m/s^2

  // --- Esquive (dash avec i-frames) ---
  dodgeSpeed: 16,         // vitesse du dash d'esquive
  dodgeTime: 0.22,        // duree du dash (s)
  dodgeIFrames: 0.34,     // duree d'invulnerabilite (s)
  dodgeCooldown: 0.9,     // temps de recharge (s)

  // --- Combos (chaine de coups legers) ---
  comboWindow: 0.85,      // fenetre pour enchainer (s)
  comboMax: 3,            // longueur max de la chaine
  comboStep: 0.18,        // +18% de degats par palier de combo
  comboFinisherKb: 3.0,   // multiplicateur de recul sur le coup final
};

// Chaque classe : stats + super-pouvoir.
// super.kind : 'radial' (onde autour de soi) | 'projectile' (tir) | 'dash' (charge avant)
export const CLASSES = {
  brawler: {
    id: 'brawler', name: 'Brawler', color: 0x4aa3ff,
    maxHp: 120, speed: 6.8,
    light: { dmg: 7, cd: 0.34, range: 2.3, kb: 1.5 },
    heavy: { dmg: 16, cd: 0.72, range: 2.5, kb: 5 },
    super: { kind: 'radial', name: 'Onde de choc', dmg: 30, radius: 6, kb: 9 },
  },
  ninja: {
    id: 'ninja', name: 'Ninja', color: 0xb06bff,
    maxHp: 90, speed: 9.0,
    light: { dmg: 6, cd: 0.26, range: 2.1, kb: 1 },
    heavy: { dmg: 13, cd: 0.6, range: 2.3, kb: 3.5 },
    super: { kind: 'dash', name: 'Lames fantômes', dmg: 26, range: 8, kb: 4 },
  },
  titan: {
    id: 'titan', name: 'Titan', color: 0xff8a3b,
    maxHp: 165, speed: 5.0,
    light: { dmg: 9, cd: 0.46, range: 2.4, kb: 2 },
    heavy: { dmg: 22, cd: 0.95, range: 2.6, kb: 7 },
    super: { kind: 'radial', name: 'Séisme', dmg: 36, radius: 7, kb: 11 },
  },
  mage: {
    id: 'mage', name: 'Mage', color: 0x2ee6a0,
    maxHp: 100, speed: 6.0,
    light: { dmg: 7, cd: 0.4, range: 2.2, kb: 1 },
    heavy: { dmg: 15, cd: 0.7, range: 2.3, kb: 3 },
    super: { kind: 'projectile', name: 'Boule de feu', dmg: 28, speed: 18, kb: 5 },
  },
};

export const CLASS_LIST = Object.values(CLASSES);

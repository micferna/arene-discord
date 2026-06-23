# ⚔️ Arène — Discord Activity (jeu de combat 3D temps réel)

Jeu de baston **en 3D temps réel** qui tourne **dans Discord** (Activity / Embedded App SDK) :
ring, combattants, caméra **3ème ou 1ère personne**, **barres de vie + énergie**, coups légers/lourds,
garde, et **super-pouvoir par classe**. Multijoueur via WebSocket, + une **IA d'entraînement** quand tu es seul.

> ⚠️ C'est une **base jouable** (un squelette solide), pas un Tekken fini. Tout est commenté et fait pour être enrichi.

## 🧱 Stack

- **Client** : [Vite](https://vitejs.dev) + [Three.js](https://threejs.org) + [`@discord/embedded-app-sdk`](https://github.com/discord/embedded-app-sdk)
- **Serveur** : Node + Express (échange OAuth Discord) + `ws` (relais multijoueur)

```
client/   appli web 3D (le jeu)
server/   auth Discord + websocket temps réel
```

## ▶️ Lancer en local (sans Discord, pour tester tout de suite)

```bash
npm install            # installe client + server (workspaces)
cp .env.example .env   # (facultatif en local : laisse les valeurs par défaut)
npm run dev            # démarre le serveur (3001) ET le client (5173)
```

Ouvre **http://localhost:5173**, choisis une classe, **clique dans la scène** pour capturer la souris, et tu combats un **bot d'entraînement**.

Contrôles : **ZQSD/WASD** bouger · **Souris** viser · **Clic gauche** coup léger · **Clic droit** coup lourd · **Maj** garde · **E** super (jauge pleine) · **V** vue 1ère/3ème personne · **Échap** relâche la souris.

> Astuce multijoueur local : ouvre **deux onglets** sur `localhost:5173`. Ils partagent la même room et se voient en PvP.

## 🎮 Brancher en vraie Discord Activity

1. Va sur https://discord.com/developers/applications → **New Application**.
2. Note l'**Application ID** et crée un **Client Secret** (onglet OAuth2).
3. Remplis `.env` à la racine :
   ```
   DISCORD_CLIENT_ID=...
   DISCORD_CLIENT_SECRET=...
   VITE_DISCORD_CLIENT_ID=...   # même valeur que DISCORD_CLIENT_ID
   ```
4. Active l'**Activity** : onglet **Activities → Settings**, coche *Enable Activities*.
5. **URL Mappings** (onglet Activities → URL Mappings) :
   - `/` → l'URL publique de ton client (ton tunnel, ex. `https://xxxx.trycloudflare.com`)
   - Le client proxifie déjà `/api` et `/ws` vers le serveur (port 3001) via `vite.config.js`.
6. Expose ton `localhost` en HTTPS pour les tests, par ex. :
   ```bash
   npx cloudflared tunnel --url http://localhost:5173
   ```
   et mets l'URL générée dans **URL Mappings** (`/`).
7. Dans Discord, rejoins un **salon vocal** → bouton **Activités** (la fusée) → lance ton appli.

Doc officielle : https://discord.com/developers/docs/activities/overview

## 🔧 Scripts & qualité

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur + client en dev (hot reload) |
| `npm run build` | Build de production du client |
| `npm run lint` / `lint:fix` | ESLint (flat config, navigateur + Node) |
| `npm run typecheck` | Vérification de types via JSDoc (`tsc --noEmit`, sans migrer en TS) |
| `npm run check` | `lint` + `typecheck` + `build` enchaînés (idéal CI) |
| `npm run bench` | Benchmark du relais temps réel (débit + latence) |

- **Sécurité** : `npm audit` → 0 vulnérabilité (SDK Discord en `2.5.0`).
- **Types** : le code reste en `.js` mais est type-checké (types `three` / SDK / DOM via `tsconfig.json` + JSDoc). Aucune surface TS à maintenir, sécurité de types quand même.
- **Benchmark** (8 joueurs sur une machine de dev) : ~1 000 msg/s relayés en soutenu à 20 Hz, latence p95 ≈ 5 ms, ~100 000 msg/s en pic. Réglable via `BENCH_CLIENTS`, `BENCH_HZ`, `BENCH_SECONDS`.

## 🛠️ Tout se règle dans `client/src/config.js`

- `CLASSES` : stats + super-pouvoir de chaque combattant (Brawler / Ninja / Titan / Mage).
- `COMBAT` : dégâts de garde, énergie, i-frames, durée des rounds…
- `ARENA` : taille du ring.

## 💡 Idées d'évolution

- Animations/modèles 3D importés (glTF) au lieu des primitives.
- Sauts/esquives, combos, projectiles qui rebondissent.
- Score de manches (best of 3), classement, sons.
- Synchro autoritaire côté serveur (anti-triche) au lieu du relais simple.

## 🧩 Architecture rapide

- `client/src/game/Game.js` — moteur : scène, caméra, combat, réseau, rounds.
- `client/src/game/Fighter.js` — modèle 3D animé + état d'un combattant.
- `client/src/game/Arena.js` — le ring.
- `client/src/game/AI.js` — l'adversaire IA.
- `client/src/net.js` / `server/index.js` — le multijoueur (relais par room = instance d'Activity).
- `client/src/discord.js` — auth Discord (et mode local de secours).

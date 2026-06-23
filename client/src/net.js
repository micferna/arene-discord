// Client WebSocket : connexion au serveur relais et envoi/reception de messages JSON.
// Protocole (champ `t`) :
//   join   { room, id, name, cls }            -> envoye a la connexion
//   peers  { peers:[{id,name,cls}] }          -> recu : joueurs deja presents
//   join   { id, name, cls }                  -> recu : un joueur arrive
//   leave  { id }                             -> recu : un joueur part
//   state  { id, x, z, ry, anim, hp, energy } -> position/etat (frequent)
//   hit    { id, target, dmg, kb, kx, kz }    -> "j'ai touche `target`"
//   hp     { id, hp, energy, dead }           -> mes points de vie ont change
//   super  { id, kind }                       -> effet visuel de super

export class Net extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.queue = [];
  }

  connect(info) {
    this.info = info; // { room, id, name, cls }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // En Activity, tout passe par l'origine courante (proxifie). En local : meme chose via Vite.
    const url = `${proto}://${location.host}/ws`;
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.warn('WebSocket indisponible, mode hors-ligne.', e);
      return;
    }

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.send({ t: 'join', room: info.room, id: info.id, name: info.name, cls: info.cls });
      for (const m of this.queue) this.ws.send(JSON.stringify(m));
      this.queue = [];
      this.dispatchEvent(new Event('open'));
    });

    this.ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      this.dispatchEvent(new CustomEvent('msg', { detail: msg }));
    });

    this.ws.addEventListener('close', () => { this.connected = false; });
    this.ws.addEventListener('error', () => { this.connected = false; });
  }

  send(msg) {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      this.queue.push(msg);
    }
  }
}

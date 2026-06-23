import './style.css';
import { setupDiscord } from './discord.js';
import { Net } from './net.js';
import { HUD } from './ui/hud.js';
import { Game } from './game/Game.js';

const canvas = document.getElementById('scene');
const hud = new HUD(document.getElementById('hud'));

async function boot() {
  let info;
  try {
    info = await setupDiscord();
  } catch (err) {
    console.error('Initialisation Discord impossible, bascule en mode local.', err);
    info = {
      embedded: false,
      user: { id: 'local-' + Math.random().toString(36).slice(2, 9), username: 'Toi', global_name: 'Toi' },
      roomId: 'local-room',
    };
  }

  const net = new Net();
  const game = new Game(canvas, hud, net, info.user);
  net.addEventListener('msg', (ev) => game.handleNet(/** @type {CustomEvent} */ (ev).detail));

  hud.showClassSelect((classId) => {
    game.spawnLocal(classId);
    net.connect({
      room: info.roomId,
      id: info.user.id,
      name: info.user.global_name || info.user.username,
      cls: classId,
    });
    game.start();
    // demande le pointer lock au premier clic dans la scene
    canvas.requestPointerLock?.();
  });
}

boot();

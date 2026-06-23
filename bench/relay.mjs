// Benchmark du relais temps reel (le coeur du multijoueur).
// Lance le serveur, connecte N joueurs dans une room, et mesure :
//   - le debit de relais soutenu a 20 Hz (messages relayes / s)
//   - la latence de relais (p50 / p95 / p99)  [horloge monotone partagee, meme process]
//   - le debit max en rafale (burst)
import { performance } from 'node:perf_hooks';
import WS from 'ws';
const WebSocket = WS.WebSocket ?? WS;

const N = Number(process.env.BENCH_CLIENTS || 8);   // joueurs simultanes
const HZ = Number(process.env.BENCH_HZ || 20);      // frequence d'envoi (comme le jeu)
const SECONDS = Number(process.env.BENCH_SECONDS || 3);
const BURST = Number(process.env.BENCH_BURST || 2000); // messages/joueur en rafale
const PORT = 3099;
const URL = `ws://localhost:${PORT}/ws`;

process.env.PORT = String(PORT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => arr.length ? arr.sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(p / 100 * arr.length))] : 0;

function makeClient(id, onState) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', room: 'bench', id, name: id, cls: 'brawler' }));
      resolve(ws);
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'state') onState(m);
    });
    ws.on('error', () => {});
  });
}

async function main() {
  console.log(`\n⚙️  Benchmark relais — ${N} joueurs, ${HZ} Hz, ${SECONDS}s soutenu + rafale ${BURST}/joueur\n`);

  // Demarre le serveur dans ce process
  await import('../server/index.js');
  await sleep(400);

  const latencies = [];
  let relayed = 0;
  const onState = (m) => {
    relayed++;
    if (typeof m.sentAt === 'number') latencies.push(performance.now() - m.sentAt);
  };

  const clients = [];
  for (let i = 0; i < N; i++) clients.push(await makeClient(`P${i}`, onState));
  await sleep(300); // laisse les 'peers'/'join' se propager

  // --- Phase 1 : debit soutenu a HZ ---
  relayed = 0; latencies.length = 0;
  const interval = 1000 / HZ;
  const t0 = performance.now();
  const timers = clients.map((ws) =>
    setInterval(() => {
      ws.send(JSON.stringify({ t: 'state', x: Math.random() * 10, z: Math.random() * 10, ry: 0, anim: 'move', hp: 100, energy: 0, sentAt: performance.now() }));
    }, interval)
  );
  await sleep(SECONDS * 1000);
  timers.forEach(clearInterval);
  await sleep(200); // drainage
  const t1 = performance.now();
  const dur = (t1 - t0) / 1000;
  const sustainedRate = Math.round(relayed / dur);

  console.log('— Phase 1 : débit soutenu —');
  console.log(`  messages relayés        : ${relayed}`);
  console.log(`  débit relais            : ${sustainedRate.toLocaleString('fr-FR')} msg/s`);
  console.log(`  latence relais p50/p95/p99 : ${pct(latencies, 50).toFixed(2)} / ${pct(latencies, 95).toFixed(2)} / ${pct(latencies, 99).toFixed(2)} ms`);
  console.log(`  latence max             : ${Math.max(...latencies).toFixed(2)} ms\n`);

  // --- Phase 2 : rafale (debit max) ---
  relayed = 0;
  const b0 = performance.now();
  for (const ws of clients) {
    for (let i = 0; i < BURST; i++) {
      ws.send(JSON.stringify({ t: 'state', x: i, z: i, ry: 0, anim: 'idle', hp: 100, energy: 0 }));
    }
  }
  // attend que tout soit drainé (relayed attendu = BURST * N * (N-1))
  const expected = BURST * N * (N - 1);
  while (relayed < expected && performance.now() - b0 < 15000) await sleep(20);
  const b1 = performance.now();
  const burstRate = Math.round(relayed / ((b1 - b0) / 1000));

  console.log('— Phase 2 : rafale (débit max) —');
  console.log(`  messages envoyés        : ${(BURST * N).toLocaleString('fr-FR')}`);
  console.log(`  messages relayés        : ${relayed.toLocaleString('fr-FR')} / ${expected.toLocaleString('fr-FR')} attendus`);
  console.log(`  débit relais max        : ${burstRate.toLocaleString('fr-FR')} msg/s`);
  console.log(`  durée                   : ${((b1 - b0) / 1000).toFixed(2)} s\n`);

  console.log('✅ Benchmark terminé.');
  clients.forEach((ws) => ws.close());
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

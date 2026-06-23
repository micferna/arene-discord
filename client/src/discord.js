// Integration Discord Embedded App SDK.
// En dehors de Discord (npm run dev dans un navigateur normal), on bascule en "mode local"
// avec un faux utilisateur, pour pouvoir jouer/tester immediatement.
import { DiscordSDK } from '@discord/embedded-app-sdk';

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// CLIENT_ID : priorite a l'env (dev), sinon fourni par le serveur a l'execution (prod).
async function getClientId() {
  if (import.meta.env.VITE_DISCORD_CLIENT_ID) return import.meta.env.VITE_DISCORD_CLIENT_ID;
  try {
    const r = await fetch('/api/config');
    const { clientId } = await r.json();
    return clientId || null;
  } catch {
    return null;
  }
}

export async function setupDiscord() {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded = params.has('frame_id'); // present uniquement dans l'iframe Discord
  const CLIENT_ID = await getClientId();

  if (!isEmbedded || !CLIENT_ID) {
    // --- Mode local : pas de Discord, on invente un joueur ---
    return {
      embedded: false,
      sdk: null,
      user: { id: 'local-' + randomId(), username: 'Toi', global_name: 'Toi' },
      roomId: 'local-room',
    };
  }

  // --- Mode Discord Activity ---
  const sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds', 'rpc.activities.write'],
  });

  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const { access_token } = await res.json();

  const auth = await sdk.commands.authenticate({ access_token });

  return {
    embedded: true,
    sdk,
    user: auth.user, // { id, username, global_name, ... }
    roomId: sdk.instanceId, // une room par instance d'Activity
  };
}

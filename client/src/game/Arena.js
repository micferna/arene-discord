import * as THREE from 'three';
import { ARENA } from '../config.js';

// Construit la scene : sol, ring surreleve, cordes, eclairage, ciel.
export function buildArena(scene) {
  scene.background = new THREE.Color(0x0b0c1a);
  scene.fog = new THREE.Fog(0x0b0c1a, 35, 80);

  // Lumieres
  const hemi = new THREE.HemisphereLight(0x9bb8ff, 0x202030, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(12, 24, 8);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 80;
  dir.shadow.camera.left = -25;
  dir.shadow.camera.right = 25;
  dir.shadow.camera.top = 25;
  dir.shadow.camera.bottom = -25;
  scene.add(dir);

  // Spots colores pour l'ambiance "arene"
  const spotA = new THREE.PointLight(0xff4060, 0.8, 60); spotA.position.set(-18, 14, -10); scene.add(spotA);
  const spotB = new THREE.PointLight(0x4060ff, 0.8, 60); spotB.position.set(18, 14, 10); scene.add(spotB);

  // Sol exterieur (sombre)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 48),
    new THREE.MeshStandardMaterial({ color: 0x07070f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  const R = ARENA.radius;

  // Plateforme du ring (cylindre)
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R + 0.6, ARENA.ringHeight, 48),
    new THREE.MeshStandardMaterial({ color: 0x1b1d33, roughness: 0.85, metalness: 0.1 })
  );
  platform.position.y = ARENA.ringHeight / 2;
  platform.receiveShadow = true;
  scene.add(platform);

  // Surface du ring (disque clair avec un cercle central)
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c2f55, roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(R, 48), mat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = ARENA.ringHeight + 0.001;
  top.receiveShadow = true;
  scene.add(top);

  const centerRing = new THREE.Mesh(
    new THREE.RingGeometry(R * 0.28, R * 0.3, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd84a, side: THREE.DoubleSide })
  );
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = ARENA.ringHeight + 0.01;
  scene.add(centerRing);

  // Poteaux + cordes
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0x551020, roughness: 0.5 });
  const posts = 24;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (i % 6 === 0) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x101225, metalness: 0.6, roughness: 0.4 }));
      post.position.set(x, ARENA.ringHeight + 1.5, z);
      post.castShadow = true;
      scene.add(post);
    }
  }
  // 3 cordes (anneaux toriques)
  for (let h = 0; h < 3; h++) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 8, 64), ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.position.y = ARENA.ringHeight + 0.9 + h * 0.7;
    scene.add(rope);
  }

  return { radius: R, floorY: ARENA.ringHeight };
}

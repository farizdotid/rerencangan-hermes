import * as THREE from 'three';
import { clampPixelRatio } from './scene/pixelRatio';
import './style.css';

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef3fb);

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.5, 2, 3.5);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(3, 5, 2);
scene.add(sun);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x4a7fd6, roughness: 0.6 }),
);
scene.add(cube);

const timer = new THREE.Timer();

function frame(time: number): void {
  const dt = timer.update(time).getDelta();
  cube.rotation.x += dt * 0.5;
  cube.rotation.y += dt * 0.8;
  renderer.render(scene, camera);
}

function onResize(): void {
  if (!container) return;
  const { clientWidth: w, clientHeight: h } = container;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
  renderer.setSize(w, h);
}

// Stop rendering while the tab is hidden (PRD section 8: performance).
function onVisibilityChange(): void {
  if (document.hidden) {
    renderer.setAnimationLoop(null);
  } else {
    timer.reset(); // discard time spent hidden
    renderer.setAnimationLoop(frame);
  }
}

window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', onVisibilityChange);
renderer.setAnimationLoop(frame);

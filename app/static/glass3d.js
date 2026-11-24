/* Bierstudio – das Glas in 3D (Three.js, nur geladen, wenn ein Glas zu sehen ist).
   Ein Pint aus Glas, das sich bis zur Note füllt: Flüssigkeit in der Farbe des Bierstils,
   Schaumkrone, aufsteigende Perlen, leichtes Schwappen bei jeder Änderung.
   Ohne WebGL bleibt das CSS-Glas stehen (mountGlass gibt dann null zurück). */
import * as THREE from '/vendor/three.module.min.js';

const RIM = 1.2, BASE = -1.2, FLOOR = -1.0, FOAM = 0.22;
const R_IN_BOTTOM = 0.6, R_IN_TOP = 0.8;
const rIn = y => R_IN_BOTTOM + (R_IN_TOP - R_IN_BOTTOM) * (y - FLOOR) / (RIM - FLOOR);
/** Note 0–10 → Höhe der Oberfläche; oben bleibt Platz für die Schaumkrone. */
const levelOf = v => FLOOR + 0.06 + (RIM - FOAM - 0.03 - FLOOR - 0.06) * Math.max(0, Math.min(10, v)) / 10;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Weiche Umgebung aus ein paar Leuchtflächen: gibt dem Glas Spiegelungen wie im Studio. */
function studioEnv(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#2a2633');
  const panel = (w, h, x, y, z, ry, c = '#ffffff', i = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; m.lookAt(0, 0, 0); env.add(m);
  };
  panel(3, 8, -5, 1, 2, 0, '#ffffff', 2.2);
  panel(2, 6, 5, 0, 1, 0, '#ffe2b0', 1.4);
  panel(8, 2, 0, 6, 0, 0, '#ffffff', 1.2);
  panel(6, 3, 0, -1, -6, 0, '#bcd2ff', .6);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}

export function mountGlass(host, { value = null, color = '#F2A71B', idle = true } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { return null; }
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.className = 'glass3d';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = studioEnv(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.85, 6.4);
  camera.lookAt(0, -0.05, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#3a3050', 0.9));
  const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(-3, 4, 5); scene.add(key);
  const back = new THREE.DirectionalLight('#ffcf7a', 2.2); back.position.set(2, 1, -4); scene.add(back);

  const pint = new THREE.Group();
  scene.add(pint);

  // Glas: Außenwand, Rand, Innenwand und dicker Boden in einem Drehkörper
  const prof = [
    [0, BASE], [0.6, BASE], [0.63, BASE + 0.03], [R_IN_TOP + 0.045, RIM - 0.01], [R_IN_TOP + 0.02, RIM + 0.012],
    [R_IN_TOP - 0.005, RIM - 0.01], [R_IN_BOTTOM, FLOOR + 0.02], [R_IN_BOTTOM - 0.04, FLOOR], [0, FLOOR],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.13,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), glassMat);
  glass.renderOrder = 3;
  pint.add(glass);

  // Flüssigkeit: voller Innenraum, oben per Schnittebene auf die aktuelle Höhe gekappt
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), FLOOR);
  const liqProf = [[0, FLOOR + 0.004], [R_IN_BOTTOM - 0.012, FLOOR + 0.004], [R_IN_TOP - 0.012, RIM], [0, RIM]].map(([x, y]) => new THREE.Vector2(x, y));
  const liqMat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.97, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.7,
    emissive: new THREE.Color(color), emissiveIntensity: 0.42, clippingPlanes: [clip], side: THREE.DoubleSide,
  });
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqProf, 72), liqMat);
  liquid.renderOrder = 1;
  pint.add(liquid);

  // Schaumkrone: weicher Zylinder mit gewölbter Oberseite, schwappt mit
  const wave = new THREE.Group();
  pint.add(wave);
  const foamMat = new THREE.MeshStandardMaterial({ color: '#FFFBF0', roughness: 0.85, metalness: 0 });
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, FOAM, 72, 1, false), foamMat);
  foam.position.y = FOAM / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 12, 0, Math.PI * 2, 0, Math.PI / 2), foamMat);
  dome.scale.y = 0.12; dome.position.y = FOAM;
  wave.add(foam, dome);
  foam.renderOrder = dome.renderOrder = 2;

  // Perlen
  const N = 18;
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, clippingPlanes: [clip] });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), bubbleMat, N);
  bubbles.renderOrder = 2;
  pint.add(bubbles);
  const seeds = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.45, y: Math.random(), s: 0.012 + Math.random() * 0.018, v: 0.25 + Math.random() * 0.35 }));
  const m4 = new THREE.Matrix4();

  // Zustand
  let target = value, level = value == null ? FLOOR : levelOf(value), shown = value != null;
  let tilt = 0, tiltV = 0, cheerT = -1, dragX = null, spin = 0, spinV = 0, t0 = performance.now(), raf = 0, visible = true, alive = true;
  const setColor = c => {
    liqMat.color.set(c); liqMat.emissive.set(c);
    const dark = liqMat.color.getHSL({}).l < 0.25;
    foamMat.color.set(dark ? '#EBDDC6' : '#FFFBF0');
  };
  setColor(color);

  function size() {
    const w = canvas.clientWidth || host.clientWidth, h = canvas.clientHeight || host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = 28 * Math.max(1, (0.72 / camera.aspect));
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    const still = reduce();
    // Füllhöhe federt zur Zielhöhe
    const goal = target == null ? FLOOR : levelOf(target);
    level += (goal - level) * (still ? 1 : Math.min(1, dt * 6));
    shown = target != null || level > FLOOR + 0.01;
    // Schwappen: gedämpfte Feder
    tiltV += (-tilt * 90 - tiltV * 7) * dt; tilt += tiltV * dt;
    if (still) tilt = tiltV = 0;
    // Drehen: Ziehen oder sanftes Pendeln
    if (dragX == null) { spinV *= Math.pow(0.04, dt); spin += spinV * dt; }
    const sway = idle && !still ? Math.sin(now / 2400) * 0.22 : 0;
    pint.rotation.y = spin + sway;
    // Anstoßen
    if (cheerT >= 0) {
      cheerT += dt;
      const k = Math.min(1, cheerT / 0.7), e = Math.sin(k * Math.PI);
      pint.rotation.z = -0.28 * e; pint.position.y = 0.18 * e;
      if (k >= 1) { cheerT = -1; pint.rotation.z = 0; pint.position.y = 0; }
    }

    clip.constant = level + pint.position.y;
    liquid.visible = bubbles.visible = wave.visible = shown;
    const r = rIn(level) - 0.012;
    wave.position.y = level - 0.01;
    wave.scale.set(r, 1, r);
    wave.rotation.z = tilt * 0.6; wave.rotation.x = tilt * 0.35;

    if (shown && !still) {
      const span = level - FLOOR;
      for (let i = 0; i < N; i++) {
        const b = seeds[i];
        b.y += dt * b.v / Math.max(span, 0.3);
        if (b.y > 1) { b.y = 0; b.a = Math.random() * Math.PI * 2; b.r = Math.random() * 0.45; }
        const y = FLOOR + 0.05 + b.y * (span - 0.08), rr = b.r * rIn(y);
        m4.makeScale(b.s, b.s, b.s).setPosition(Math.cos(b.a) * rr, y, Math.sin(b.a) * rr);
        bubbles.setMatrixAt(i, m4);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    } else if (shown) {
      for (let i = 0; i < N; i++) bubbles.setMatrixAt(i, m4.makeScale(0, 0, 0));
      bubbles.instanceMatrix.needsUpdate = true;
    }

    renderer.render(scene, camera);
    const moving = Math.abs(goal - level) > 0.001 || Math.abs(tilt) > 0.0005 || cheerT >= 0 || Math.abs(spinV) > 0.001 || dragX != null;
    if (visible && !document.hidden && (!still || moving)) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && alive) { t0 = performance.now(); raf = requestAnimationFrame(frame); } };

  const ro = new ResizeObserver(() => { size(); kick(); });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  io.observe(canvas);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);

  // Mit dem Finger drehen (senkrechtes Scrollen bleibt frei)
  let lastX = 0, lastT = 0;
  canvas.addEventListener('pointerdown', e => { dragX = e.clientX; lastX = e.clientX; lastT = e.timeStamp; spinV = 0; canvas.setPointerCapture(e.pointerId); kick(); });
  canvas.addEventListener('pointermove', e => {
    if (dragX == null) return;
    const dx = e.clientX - lastX, dtm = Math.max(1, e.timeStamp - lastT);
    spin += dx * 0.012; spinV = dx * 0.012 / (dtm / 1000); lastX = e.clientX; lastT = e.timeStamp;
  });
  const up = () => { dragX = null; kick(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  size();
  kick();

  return {
    /** Neue Note (oder null = leer) und Farbe; Änderungen bringen die Oberfläche zum Schwappen. */
    set(v, c) {
      if (c) setColor(c);
      if (v !== target) { tiltV += Math.max(-1.2, Math.min(1.2, ((v ?? 0) - (target ?? 0)) * 0.9)); target = v; }
      kick();
    },
    /** Kurzes Anheben und Neigen, wie zum Anstoßen. */
    cheer() { cheerT = 0; tiltV -= 1.4; kick(); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
      scene.environment?.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}

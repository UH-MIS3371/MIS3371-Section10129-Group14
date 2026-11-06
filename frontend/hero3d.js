// Picker header: a slowly turning 3D bar landscape (three.js). Each row is one scenario's market
// in the year before it starts, drawn in that scenario's colour.
(() => {
  const canvas = document.getElementById("heroScene");
  if (!window.THREE || !canvas) return;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c0c0e, 14, 30);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(5, 10, 7);
  scene.add(light);

  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(0.22, 1, 0.5);
  SCENARIOS.forEach((s, row) => {
    const closes = s.stocks[s.benchmark].bars.slice(0, s.start).map((b) => b[3]);
    const step = Math.ceil(closes.length / 48);
    const points = closes.filter((_, i) => i % step === 0);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const material = new THREE.MeshStandardMaterial({ color: THEMES[s.id].hue, roughness: 0.5 });
    points.forEach((v, i) => {
      const height = 0.3 + ((v - min) / (max - min || 1)) * 3;
      const bar = new THREE.Mesh(box, material);
      bar.scale.y = height;
      bar.position.set((i - points.length / 2) * 0.3, height / 2, (row - 2) * 0.9);
      group.add(bar);
    });
  });
  scene.add(group);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(t) {
    group.rotation.y = -0.5 + Math.sin(t / 9000) * 0.35;
    camera.position.set(0, 6, 11);
    camera.lookAt(0, 1, 0);
    renderer.render(scene, camera);
    if (!still && !document.getElementById("picker").hidden) requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
  window.startHeroScene = () => requestAnimationFrame(frame);
})();

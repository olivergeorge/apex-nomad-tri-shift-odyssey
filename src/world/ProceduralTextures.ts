import * as THREE from 'three';

export interface ProceduralTextureSet {
  highwayTexture: THREE.CanvasTexture;
  sandBumpTexture: THREE.CanvasTexture;
  atlantisTileTexture: THREE.CanvasTexture;
  contactShadowTexture: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(
  renderer: THREE.WebGLRenderer
): ProceduralTextureSet {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Highway Asphalt Texture (SRGBColorSpace)
  const hwCanvas = document.createElement('canvas');
  hwCanvas.width = 512;
  hwCanvas.height = 512;
  const hwCtx = hwCanvas.getContext('2d')!;

  // Dark weathered asphalt base
  hwCtx.fillStyle = '#1e222a';
  hwCtx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain & tire wear tracks
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 24 + Math.floor(Math.random() * 20);
    hwCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    hwCtx.fillRect(x, y, 2, 2);
  }

  // Darker tire track lanes
  hwCtx.fillStyle = 'rgba(10, 12, 16, 0.28)';
  hwCtx.fillRect(110, 0, 70, 512);
  hwCtx.fillRect(332, 0, 70, 512);

  // Outer shoulder dirt blend
  const leftGrad = hwCtx.createLinearGradient(0, 0, 38, 0);
  leftGrad.addColorStop(0, '#9c623e');
  leftGrad.addColorStop(1, 'rgba(30, 34, 42, 0)');
  hwCtx.fillStyle = leftGrad;
  hwCtx.fillRect(0, 0, 38, 512);

  const rightGrad = hwCtx.createLinearGradient(474, 0, 512, 0);
  rightGrad.addColorStop(0, 'rgba(30, 34, 42, 0)');
  rightGrad.addColorStop(1, '#9c623e');
  hwCtx.fillStyle = rightGrad;
  hwCtx.fillRect(474, 0, 38, 512);

  // Crisp white edge lines
  hwCtx.fillStyle = '#e2e8f0';
  hwCtx.fillRect(42, 0, 8, 512);
  hwCtx.fillRect(462, 0, 8, 512);

  // Double yellow center line with dashed passing ticks
  hwCtx.fillStyle = '#f59e0b';
  hwCtx.fillRect(247, 0, 6, 512);
  hwCtx.fillRect(259, 0, 6, 512);

  // White lane dividers (dashed)
  hwCtx.fillStyle = 'rgba(226, 232, 240, 0.65)';
  for (let y = 20; y < 512; y += 128) {
    hwCtx.fillRect(145, y, 5, 56);
    hwCtx.fillRect(362, y, 5, 56);
  }

  const highwayTexture = new THREE.CanvasTexture(hwCanvas);
  highwayTexture.colorSpace = THREE.SRGBColorSpace;
  highwayTexture.wrapS = THREE.ClampToEdgeWrapping;
  highwayTexture.wrapT = THREE.RepeatWrapping;
  highwayTexture.repeat.set(1, 75);
  highwayTexture.anisotropy = maxAniso;

  // 2. Desert Sand / Rock Bump Texture (Linear NoColorSpace)
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 256;
  sandCanvas.height = 256;
  const sCtx = sandCanvas.getContext('2d')!;
  sCtx.fillStyle = '#808080';
  sCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 90 + Math.floor(Math.random() * 80);
    sCtx.fillStyle = `rgb(${v},${v},${v})`;
    sCtx.fillRect(x, y, 3, 2);
  }
  const sandBumpTexture = new THREE.CanvasTexture(sandCanvas);
  sandBumpTexture.wrapS = THREE.RepeatWrapping;
  sandBumpTexture.wrapT = THREE.RepeatWrapping;
  sandBumpTexture.repeat.set(40, 40);
  sandBumpTexture.anisotropy = maxAniso;

  // 3. Lost Underwater City of Aethelgard Mosaic Texture (SRGBColorSpace)
  const atlCanvas = document.createElement('canvas');
  atlCanvas.width = 512;
  atlCanvas.height = 512;
  const aCtx = atlCanvas.getContext('2d')!;
  aCtx.fillStyle = '#0c2438';
  aCtx.fillRect(0, 0, 512, 512);

  // Concentric ancient geometry & glowing cyan runes
  aCtx.strokeStyle = '#06b6d4';
  aCtx.lineWidth = 4;
  for (let r = 40; r <= 240; r += 48) {
    aCtx.beginPath();
    aCtx.arc(256, 256, r, 0, Math.PI * 2);
    aCtx.stroke();
  }
  // Radial lines
  aCtx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
  aCtx.lineWidth = 2;
  for (let a = 0; a < 12; a++) {
    const ang = (a * Math.PI) / 6;
    aCtx.beginPath();
    aCtx.moveTo(256 + Math.cos(ang) * 40, 256 + Math.sin(ang) * 40);
    aCtx.lineTo(256 + Math.cos(ang) * 240, 256 + Math.sin(ang) * 240);
    aCtx.stroke();
  }
  const atlantisTileTexture = new THREE.CanvasTexture(atlCanvas);
  atlantisTileTexture.colorSpace = THREE.SRGBColorSpace;
  atlantisTileTexture.wrapS = THREE.RepeatWrapping;
  atlantisTileTexture.wrapT = THREE.RepeatWrapping;
  atlantisTileTexture.anisotropy = maxAniso;

  // 4. Soft Radial Contact Shadow Texture
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext('2d')!;
  const radGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  radGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = radGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowTexture = new THREE.CanvasTexture(shCanvas);
  contactShadowTexture.colorSpace = THREE.SRGBColorSpace;

  return {
    highwayTexture,
    sandBumpTexture,
    atlantisTileTexture,
    contactShadowTexture,
    dispose: () => {
      highwayTexture.dispose();
      sandBumpTexture.dispose();
      atlantisTileTexture.dispose();
      contactShadowTexture.dispose();
    },
  };
}

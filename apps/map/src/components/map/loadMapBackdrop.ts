// Same shape as loadGrass.ts -- resolves null on a failed decode rather than rejecting, so
// a slow/blocked network never crashes usePublicColonyCanvas.ts's mount effect. Colony-
// agnostic: takes the already-resolved backdrop image URL (mapBackdrops.ts), not a colonyId.
export function loadMapBackdropImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

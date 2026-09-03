import grassPhotoUrl from "../../assets/textures/grass-satellite.jpg";

// Shared by useColonyCanvas.ts and usePublicColonyCanvas.ts (previously duplicated
// verbatim in both) — resolves null on a failed decode rather than rejecting, so a slow or
// blocked network never crashes either mount effect; both callers already treat a null
// image as "use the flat ground colour fallback".
export function loadGrass(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = grassPhotoUrl;
  });
}

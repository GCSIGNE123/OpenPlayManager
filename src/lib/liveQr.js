// Share Live — client-side QR generation for the public live URL. Uses the
// `qrcode` library (the same one the Player app already uses for its own
// check-in QR); nothing is sent anywhere — the QR is drawn from the URL string
// in the browser and returned as a PNG data URL.
//
// The generator is injectable so scripts/verify-share-live.mjs can exercise
// the path with the real library or a stub, without a DOM.
export async function makeLiveQrDataUrl(url, generator = null) {
  if (typeof url !== "string" || url === "") throw new Error("makeLiveQrDataUrl: a URL is required");
  const qr = generator || (await import("qrcode")).default;
  return qr.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: "M" });
}

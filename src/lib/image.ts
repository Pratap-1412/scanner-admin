/**
 * Sized image URLs. Cloudinary can resize and pick the best format (AVIF/WebP) per
 * browser on the fly, so a 112 px thumbnail never downloads the 2000 px original.
 * Other URLs (local development) are returned as they are.
 */
const CLOUDINARY = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?!.*\b[fqw]_)(.+)$/;

export function sizedUrl(url: string, width: number) {
  const m = CLOUDINARY.exec(url);
  if (!m) return url;
  return `${m[1]}f_auto,q_auto:good,c_limit,w_${Math.round(width)}/${m[2]}`;
}

/** `src` and a 1x/2x `srcSet` for an image shown `width` CSS pixels wide. */
export function imgProps(url: string, width: number) {
  const src = sizedUrl(url, width);
  if (src === url) return { src };
  return { src, srcSet: `${src} 1x, ${sizedUrl(url, width * 2)} 2x` };
}

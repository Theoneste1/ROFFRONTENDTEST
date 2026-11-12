"use client";

// A client component on purpose: props passed from a server component are
// serialised, which would drop `color: undefined` before it reached next/image.
import NextImage, { type ImageProps } from "next/image";

/**
 * next/image without its inline `style="color:transparent"`. The site's CSP
 * (lib/security/headers.ts) has no 'unsafe-inline' for styles, so browsers
 * block that attribute and log a violation on every page. It only hides alt
 * text while an image loads; every image here has fixed dimensions anyway.
 * Do not use `fill` through this wrapper: its positioning is an inline style too.
 */
export default function Image({ style, ...props }: ImageProps) {
  return <NextImage {...props} style={{ color: undefined, ...style }} />;
}

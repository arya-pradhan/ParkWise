import type { NextConfig } from 'next';

/**
 * Cross-origin isolation. onnxruntime-web's multi-threaded WASM backend needs
 * SharedArrayBuffer, which the browser only exposes when the document is
 * cross-origin isolated — which requires BOTH of these headers.
 *
 * `credentialless` rather than `require-corp` because it breaks far less:
 * cross-origin subresources load without CORP headers, just without credentials.
 * Safari does not support it, so Safari runs single-threaded — that is fine.
 * Threads are an optimization here, never a requirement.
 *
 * The cost of COEP is that any cross-origin subresource lacking CORP/CORS is
 * blocked. This app self-hosts everything (fonts, model, wasm, images), so the
 * cost today is zero — but it is a standing constraint on future third-party
 * embeds.
 */
const CROSS_ORIGIN_ISOLATION = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
];

/** Safe because these filenames are content-hashed or version-pinned. */
const IMMUTABLE = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      { source: '/:path*', headers: CROSS_ORIGIN_ISOLATION },
      { source: '/models/:path*', headers: IMMUTABLE },
      { source: '/ort/:path*', headers: IMMUTABLE },
    ];
  },

  webpack: (config) => {
    // onnxruntime-web ships Node-flavoured fallbacks it never uses in the
    // browser build; without these, webpack tries to resolve them and fails.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;

// The path this app is reachable at externally, via Tailscale Serve — used only to
// compute browser-facing asset URLs (Vite's build `base`). Tailscale Serve strips this
// mount prefix before forwarding to the backend, so the Node server itself is unprefixed.
export const BASE_PATH = '/lists';

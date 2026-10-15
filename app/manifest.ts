import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "UNZA Campus Navigator",
    short_name: "Campus",
    description: "Navigate campus, book rooms and chat with fellow students.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#052e16",
    categories: ["education", "navigation"],
    icons: [
      { src: "/images/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/images/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/images/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Navigate", url: "/navigation" },
      { name: "Messages", url: "/chat" },
      { name: "Bookings", url: "/bookings" },
    ],
  };
}

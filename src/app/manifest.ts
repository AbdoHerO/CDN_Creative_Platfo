import type { MetadataRoute } from "next";

/** Web app manifest: lets phones and tablets install Creative Hub on the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Creative Hub",
    short_name: "Creative Hub",
    description: "Centralised creative management for Win+Pharma, iCoral, Pharmalien and WinMed.",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    background_color: "#fafafb",
    theme_color: "#fafafb",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

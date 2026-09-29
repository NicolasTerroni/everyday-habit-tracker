import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Everyday — Habit Tracker",
    short_name: "Everyday",
    description: "A quiet record of the things that matter.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#f7f5ef",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}

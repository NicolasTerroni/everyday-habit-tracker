import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Everyday", template: "%s · Everyday" },
  description: "A quiet record of the things that matter.",
  applicationName: "Everyday",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Everyday" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg", apple: "/icon.svg" }
};

export const viewport: Viewport = {
  themeColor: "#f7f5ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

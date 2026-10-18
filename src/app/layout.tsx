import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dumping LIB R3 — WebAssembly ELF Class Dumper",
  description: "Drop an ELF shared library (.so) and extract its C++ class skeletons with method offsets — the original Dumping LIB R3 C++ tool compiled to WebAssembly, running fully in your browser.",
  keywords: ["ELF", "WebAssembly", "reverse engineering", "shared library", "symbol dumper", "demangle", "Emscripten", "C++"],
  authors: [{ name: "Dumping LIB R3" }],
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg`,
  },
  openGraph: {
    title: "Dumping LIB R3 — WebAssembly Edition",
    description: "Reverse-engineer native libraries into C++ class skeletons, 100% client-side via WebAssembly.",
    siteName: "Dumping LIB R3",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

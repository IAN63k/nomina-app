import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/contexts/auth-context";
import { AppearanceProvider } from "@/contexts/appearance-context";
import { VersionNotifier } from "@/components/version-notifier";
import "./globals.css";

// Aplica el tema guardado antes del primer paint para evitar el flash de tema por defecto.
const themeInitScript = `(function(){try{var s=localStorage.getItem('nomina-appearance');if(!s)return;var a=JSON.parse(s);var t=['soft','dark','teal','violet'].indexOf(a.theme)>=0?a.theme:'soft';var r=document.documentElement;r.dataset.theme=t;r.classList.toggle('dark',t==='dark');if(a.gradient)r.classList.add('app-gradient');}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nomina App",
  description: "Sistema de gestión de nóminas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="soft" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppearanceProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          <VersionNotifier />
        </AppearanceProvider>
      </body>
    </html>
  );
}

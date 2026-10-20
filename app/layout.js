import "./globals.css";

export const metadata = {
  title: "CheckSafe — Un doute sur un message ?",
  description:
    "CheckSafe analyse les SMS, e-mails et messages WhatsApp pour vous aider a reperer les arnaques, le phishing et la manipulation, en langage simple.",
  applicationName: "CheckSafe",
  authors: [{ name: "CheckSafe" }],
  keywords: [
    "phishing",
    "arnaque",
    "securite",
    "SMS frauduleux",
    "ingenierie sociale",
    "CheckSafe",
  ],
  openGraph: {
    title: "CheckSafe — Assistant de detection des arnaques numeriques",
    description:
      "Un doute sur un message ? Verifions ensemble en toute tranquillite.",
    type: "website",
    locale: "fr_FR",
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="min-h-full bg-gradient-to-b from-slate-50 via-blue-50/40 to-emerald-50/40 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}

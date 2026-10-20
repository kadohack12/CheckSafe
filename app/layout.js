import "./globals.css";

export const metadata = {
  title: "CheckSafe — Not sure about a message?",
  description:
    "CheckSafe reads SMS, email and WhatsApp messages to help you spot scams, phishing and manipulation, in plain language.",
  applicationName: "CheckSafe",
  authors: [{ name: "CheckSafe" }],
  keywords: [
    "phishing",
    "scam",
    "digital safety",
    "smishing",
    "social engineering",
    "CheckSafe",
  ],
  openGraph: {
    title: "CheckSafe — Digital scam detection assistant",
    description:
      "Not sure about a message? Let's look at it together, calmly.",
    type: "website",
    locale: "en_US",
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
    <html lang="en">
      <body className="min-h-full bg-gradient-to-b from-slate-50 via-blue-50/40 to-emerald-50/40 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}

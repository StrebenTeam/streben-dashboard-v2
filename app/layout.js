import { Urbanist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ['400', '500', '600', '700', '900'],
  variable: "--font-urbanist",
});

export const metadata = {
  title: "Streben Dashboard",
  description: "Google Ads & Meta Ads Performance Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en">
        <head>
          <link rel="icon" href="https://streben.io/wp-content/uploads/2025/01/Isotipo-Streben-Green-Blue.png" />
        </head>
        <body className={`${urbanist.className}`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}

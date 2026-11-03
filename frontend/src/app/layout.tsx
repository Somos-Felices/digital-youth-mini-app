import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const garamond=localFont({src:[{path:"./fonts/EBGaramond-Regular.ttf",weight:"400",style:"normal"},{path:"./fonts/EBGaramond-Italic.ttf",weight:"400",style:"italic"}],variable:"--font-garamond",display:"swap"});
const instrument=localFont({src:[{path:"./fonts/InstrumentSans-Regular.ttf",weight:"400",style:"normal"},{path:"./fonts/InstrumentSans-Medium.ttf",weight:"500",style:"normal"},{path:"./fonts/InstrumentSans-Semibold.ttf",weight:"600",style:"normal"}],variable:"--font-instrument",display:"swap"});
export const metadata:Metadata={title:"Digital Youth — Independent Digital Income",description:"Explore practical digital income methods you can investigate and test independently with a phone and accessible tools."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${garamond.variable} ${instrument.variable}`}>{children}</body></html>}

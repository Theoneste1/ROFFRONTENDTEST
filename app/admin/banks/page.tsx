import type { Metadata } from "next";
import BanksClient from "./BanksClient";

export const metadata: Metadata = { title: "Banks" };

export default function Page() {
  return <BanksClient />;
}

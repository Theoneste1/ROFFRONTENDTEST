import type { Metadata } from "next";
import RegistrationDataClient from "./RegistrationDataClient";

export const metadata: Metadata = { title: "Registration data" };

export default function Page() {
  return <RegistrationDataClient />;
}

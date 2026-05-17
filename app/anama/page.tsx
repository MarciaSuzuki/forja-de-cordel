import type { Metadata } from "next";
import { AnamaPage } from "@/components/anama/AnamaPage";

export const metadata: Metadata = {
  title: "Os Quatro de Anamá — Workshop Ready Vessels",
  description:
    "Cordel interativo: ouça, grave sua declamação e anote observações sobre cada uma das 40 estrofes.",
};

export default function Page() {
  return <AnamaPage />;
}

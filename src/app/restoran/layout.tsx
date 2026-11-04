import { RestoranClientLayout } from "./RestoranClientLayout";

export default function RestoranLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestoranClientLayout>{children}</RestoranClientLayout>;
}

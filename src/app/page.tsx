"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getCourierSession,
  getRestaurantSession,
} from "@/services/authService";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (getRestaurantSession()) {
      router.replace("/restoran");
      return;
    }
    if (getCourierSession()) {
      router.replace("/kurye");
      return;
    }
    router.replace("/login");
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center bg-[#0c0f12] p-8">
      <p className="text-sm text-zinc-500">Yönlendiriliyor…</p>
    </main>
  );
}

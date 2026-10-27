"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    apiGet("/me")
      .then(() => router.replace("/dashboard"))
      .catch(() => {
      router.replace("/login");
      });
  }, [router]);

  return null;
}

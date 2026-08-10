"use client";

import WorkRequestBoard from "@/components/WorkRequestBoard";

export default function PocDemoRequestsPage() {
  return (
    <WorkRequestBoard
      types={["poc", "demo"]}
      mode="customer"
      title="POC & Demo Requests"
      description="Permintaan Proof of Concept dan Demo untuk customer, di luar alur Project."
    />
  );
}

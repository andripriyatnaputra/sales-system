"use client";

import WorkRequestBoard from "@/components/WorkRequestBoard";

export default function InternalRequestsPage() {
  return (
    <WorkRequestBoard
      types={["internal"]}
      mode="internal"
      title="Internal Dev Request"
      description="Permintaan pengembangan internal (mis. HRIS) dari departemen ke Product & Development."
    />
  );
}

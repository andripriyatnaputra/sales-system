import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const backendUrl =
    process.env.LEADGEN_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3001";

  try {
    const response = await fetch(`${backendUrl}/api/run-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to start agents on leadgen backend" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[API /leadgen/run-agent]", error);
    return new Response(
      JSON.stringify({ error: "Cannot connect to leadgen backend" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

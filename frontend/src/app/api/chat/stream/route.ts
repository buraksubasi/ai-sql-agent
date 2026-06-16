import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { question: string; session_id: string };

  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${backendUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", content: "Backend'e bağlanılamadı." })}\n\n`,
      { status: 502, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", content: `Backend hatası: ${backendResponse.status}` })}\n\n`,
      { status: backendResponse.status, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  return new Response(backendResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

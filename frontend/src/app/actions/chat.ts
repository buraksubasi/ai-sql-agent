"use server";

export async function sendMessage(
  question: string,
  sessionId = "default_session",
): Promise<string> {
  const apiUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

  const response = await fetch(`${apiUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
  });

  if (!response.ok) {
    throw new Error("Backend isteği başarısız oldu.");
  }

  const data = (await response.json()) as { answer: string };
  return data.answer;
}

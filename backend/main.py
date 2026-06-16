# FastAPI Uygulaması & Rotalar
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from agent import get_sql_agent

app = FastAPI()

# Next.js isteklerine izin vermek için CORS ayarı
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Canlıda burayı sadece Next.js URL'i yapın
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str

agent = get_sql_agent()

@app.post("/api/chat")
async def chat_with_db(payload: QueryRequest):
    try:
        # LangChain ajanı soruyu alır, SQL üretir, çalıştırır ve yanıtlar
        result = agent.invoke({"input": payload.question})
        return {"answer": result.get("output")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
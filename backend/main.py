from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from agent import get_sql_agent_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str
    session_id: str = "default_session" # Yeni eklenen alan

router_executor = get_sql_agent_router()

@app.post("/api/chat")
async def chat_with_db(payload: QueryRequest):
    try:
        # Fonksiyona hem soruyu hem seans id'sini gönderiyoruz
        answer = router_executor(payload.question, payload.session_id)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
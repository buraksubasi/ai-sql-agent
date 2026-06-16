from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
# Yeni fonksiyonumuzu import ediyoruz
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

# Yönlendiriciyi başlatıyoruz
router_executor = get_sql_agent_router()

@app.post("/api/chat")
async def chat_with_db(payload: QueryRequest):
    try:
        # Doğrudan ajanı değil, yönlendirici fonksiyonumuzu çağırıyoruz
        answer = router_executor(payload.question)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
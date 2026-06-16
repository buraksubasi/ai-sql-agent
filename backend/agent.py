from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.agent_toolkits import create_sql_agent
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from database import get_df_connection
from pydantic import BaseModel, Field

# 1. Gemini'den alacağımız kesin yönlendirme formatını tanımlıyoruz
class RouterDecision(BaseModel):
    intent: str = Field(
        description="Kullanıcı sorusu ürünler, stok, fiyat, kategori veya veritabanı ile ilgiliyse 'DB' dönün. Selamlama, hal hatır sorma, hava durumu veya genel sohbet ise 'GENERAL' dönün."
    )

def get_sql_agent_router():
    db = get_df_connection()
    
    # Ana modelimiz (Zaman zaman yaratıcı olmaması için temperature=0)
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    
    # Genel sohbet için biraz daha samimi ve esnek bir model ayarı
    chat_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)

    # Veritabanı Ajanı Kurulumu (Eski yapınız)
    toolkit = SQLDatabaseToolkit(db=db, llm=llm)
    sql_agent = create_sql_agent(
        llm=llm,
        toolkit=toolkit,
        verbose=True,
        handle_parsing_errors=True
    )
    
    # Gemini'ye çıktı olarak sadece RouterDecision şemasını vermesini zorunlu kılıyoruz
    router_llm = llm.with_structured_output(RouterDecision)

    # Gelen isteği yönlendiren ve çalıştıran ana fonksiyon
    def route_and_execute(user_question: str):
        # Adım 1: Niyet Analizi yapıyoruz
        router_prompt = f"Aşağıdaki kullanıcı mesajının niyetini belirle:\n\nMesaj: {user_question}"
        decision = router_llm.invoke(router_prompt)
        
        print(f"\n[ROUTER] Tespit Edilen Niyet: {decision.intent}\n") # Terminalde izlemek için

        # Adım 2: Karara göre ilgili akışı tetikliyoruz
        if decision.intent == "DB":
            print("[ROUTER] İstek SQL Agent'a yönlendiriliyor...")
            result = sql_agent.invoke({"input": user_question})
            return result.get("output")
        else:
            print("[ROUTER] İstek Standart Chatbot'a yönlendiriliyor...")
            # Sistem promptu ile modele bir chatbot kimliği veriyoruz
            system_prompt = "Sen arkadaş canlısı bir asistansın. Veritabanı dışındaki konularda kullanıcıya yardımcı olmalı, selam veriyorsa selamını almalısın."
            response = chat_llm.invoke([
                ("system", system_prompt),
                ("user", user_question)
            ])
            return response.content

    return route_and_execute
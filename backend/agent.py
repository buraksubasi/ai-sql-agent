from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.agent_toolkits import create_sql_agent
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.messages import HumanMessage, AIMessage
from database import get_df_connection
from pydantic import BaseModel, Field

# 1. Global Hafıza Deposu
sessions_memory = {}

def get_chat_history(session_id: str):
    if session_id not in sessions_memory:
        sessions_memory[session_id] = []
    return sessions_memory[session_id]

# 2. Router Şeması (Niyet Belirleyici)
class RouterDecision(BaseModel):
    intent: str = Field(
        description="Kullanıcı mesajı ürünler, stok, fiyat, kategori veya veritabanı sorguları ile ilgiliyse 'DB' dönün. Selamlama, hal hatır sorma veya genel bilgi soruları için 'GENERAL' dönün."
    )

def get_sql_agent_router():
    db = get_df_connection()
    
    # Modellerimizi tanımlıyoruz
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    chat_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.5)

    # SQL Ajanı (Bu kısım sorunsuz çalışıyor)
    toolkit = SQLDatabaseToolkit(db=db, llm=llm)
    sql_agent = create_sql_agent(llm=llm, toolkit=toolkit, verbose=True, handle_parsing_errors=True)
    
    # İnternet Arama Aracı
    search_tool = DuckDuckGoSearchRun()
    
    # Yapılandırılmış çıktı veren yönlendirici
    router_llm = llm.with_structured_output(RouterDecision)

    # --- ANA ÇALIŞTIRICI FONKSİYON ---
    def route_and_execute(user_question: str, session_id: str):
        history = get_chat_history(session_id)
        
        # Router'ın geçmişi görebilmesi için son mesajları metne çeviriyoruz
        history_context = ""
        for msg in history[-4:]:
            role = "Kullanıcı" if isinstance(msg, HumanMessage) else "Asistan"
            history_context += f"{role}: {msg.content}\n"
            
        router_prompt = f"Konuşma Geçmişi:\n{history_context}\nYeni Mesaj: {user_question}\n\nNiyeti belirle:"
        decision = router_llm.invoke(router_prompt)
        
        print(f"\n[ROUTER] Session: {session_id} | Tespit Edilen Niyet: {decision.intent}\n")

        # --- SENARYO A: VERİTABANI İSTEĞİ ---
        if decision.intent == "DB":
            print("[ROUTER] SQL Agent devreye giriyor...")
            result = sql_agent.invoke({"input": user_question})
            final_response = result.get("output")

        # --- SENARYO B: GENEL SOHBET & WEB SEARCH MANTIĞI ---
        else:
            print("[ROUTER] Genel Chatbot ve Arama Kontrolü çalışıyor...")
            
            # Gemini'ye bu soru için güncel internet bilgisi gerekip gerekmediğini soruyoruz
            search_check = llm.invoke(
                f"Aşağıdaki soru güncel bir bilgi, hava durumu, son dakika haberi veya internette araştırma gerektiren bir konu mu? Sadece tek bir kelimeyle 'EVET' veya 'HAYIR' yaz.\n\nSoru: {user_question}"
            )
            
            search_context = ""
            if "EVET" in search_check.content.upper():
                print("[ROUTER] Bilgi eksikliği sezildi, internet araması yapılıyor...")
                try:
                    search_context = f"\n\n[İnternet Arama Sonuçları]: {search_tool.run(user_question)}"
                except Exception as e:
                    print(f"[ARAMA HATASI] DuckDuckGo yanıt vermedi: {e}")
            
            # Gemini için konuşma geçmişini ve (varsa) arama sonuçlarını mesaj listesi olarak hazırlıyoruz
            messages = [
                ("system", "Sen arkadaş canlısı, yetenekli bir asistansın. Sana sağlanan konuşma geçmişine ve eğer varsa internet arama sonuçlarına sadık kalarak kullanıcıya Türkçe yanıt ver.")
            ]
            
            # Hafızadaki son 6 mesajı modele besliyoruz
            for msg in history[-6:]:
                role = "user" if isinstance(msg, HumanMessage) else "assistant"
                messages.append((role, msg.content))
            
            # Güncel soruyu ve arama sonucunu ekliyoruz
            current_user_content = user_question
            if search_context:
                current_user_content += search_context
                
            messages.append(("user", current_user_content))
            
            # Yanıtı üretiyoruz
            response = chat_llm.invoke(messages)
            final_response = response.content

        # Hafızayı Güncelliyoruz
        history.append(HumanMessage(content=user_question))
        history.append(AIMessage(content=final_response))
        
        return final_response

    return route_and_execute
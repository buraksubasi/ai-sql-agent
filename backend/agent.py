# LangChain SQL Agent Kurulumu
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.agent_toolkits import create_sql_agent
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from database import get_df_connection

def get_sql_agent():
    db = get_df_connection()
    
    # Gemini modelini tanımlıyoruz
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", 
        temperature=0
    )
    
    toolkit = SQLDatabaseToolkit(db=db, llm=llm)
    
    # Güvenli ve optimize bir SQL ajanı oluşturuyoruz
    agent_executor = create_sql_agent(
        llm=llm,
        toolkit=toolkit,
        verbose=True,
        handle_parsing_errors=True
    )
    return agent_executor
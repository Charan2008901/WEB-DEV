import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

try:
    db = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "learning_platform"),
        port=int(os.getenv("DB_PORT", "3306"))
    )

    if db.is_connected():
        print("MySQL connected successfully!")

except mysql.connector.Error as err:
    print(f"Error connecting to MySQL: {err}")
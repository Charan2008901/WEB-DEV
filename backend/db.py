import os
import time

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    """Open a fresh MySQL connection, retrying temporary connection failures."""
    last_error = None

    for attempt in range(3):
        try:
            connection = mysql.connector.connect(
                host=os.environ["DB_HOST"],
                user=os.environ["DB_USER"],
                password=os.environ["DB_PASSWORD"],
                database=os.environ["DB_NAME"],
                port=int(os.getenv("DB_PORT", "3306")),
                connection_timeout=15,
                autocommit=False,
            )

            if connection.is_connected():
                return connection

            connection.close()

        except mysql.connector.Error as err:
            last_error = err

        if attempt < 2:
            time.sleep(2)

    if last_error is not None:
        raise last_error
    raise RuntimeError("Could not connect to MySQL.")

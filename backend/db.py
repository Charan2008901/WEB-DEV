
import os
import time
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

# Load local environment variables.
# Render environment variables are loaded automatically.
load_dotenv()


def get_db_connection():
    """
    Create a MySQL connection.

    Supports:
    - Local MySQL development
    - Aiven Cloud MySQL
    - SSL certificate verification
    - Automatic retry on connection failures
    """

    # Read database configuration
    db_host = os.getenv("DB_HOST")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_name = os.getenv("DB_NAME")
    db_port = os.getenv("DB_PORT", "3306")

    ssl_ca = os.getenv("DB_SSL_CA")

    # Validate required environment variables
    required_variables = {
        "DB_HOST": db_host,
        "DB_USER": db_user,
        "DB_PASSWORD": db_password,
        "DB_NAME": db_name,
    }

    missing = [
        key for key, value in required_variables.items()
        if not value
    ]

    if missing:
        raise ValueError(
            f"Missing database environment variables: {', '.join(missing)}"
        )

    try:
        db_port = int(db_port)
    except ValueError:
        raise ValueError("DB_PORT must be a valid integer.")

    # Configure connection
    connection_options = {
        "host": db_host,
        "user": db_user,
        "password": db_password,
        "database": db_name,
        "port": db_port,
        "connection_timeout": 15,
        "autocommit": False,
    }

    # Configure SSL when a CA certificate is provided
    if ssl_ca:
        ca_path = Path(ssl_ca)

        print("Database SSL: Enabled")
        print("CA certificate path:", ca_path)
        print("CA certificate exists:", ca_path.is_file())

        if not ca_path.is_file():
            raise FileNotFoundError(
                f"SSL CA certificate not found: {ca_path}"
            )

        if ca_path.stat().st_size == 0:
            raise ValueError("SSL CA certificate file is empty.")

        connection_options.update({
            "ssl_ca": str(ca_path),
            "ssl_verify_cert": True,
            "ssl_verify_identity": True,
        })

    else:
        print(
            "WARNING: DB_SSL_CA is not configured. "
            "Database SSL verification is disabled."
        )

    # Retry connection up to three times
    last_error = None

    for attempt in range(1, 4):
        connection = None

        try:
            print(
                f"Connecting to MySQL "
                f"(attempt {attempt}/3)..."
            )

            connection = mysql.connector.connect(
                **connection_options
            )

            if connection.is_connected():
                print("MySQL connection successful.")
                return connection

            connection.close()

        except mysql.connector.Error as err:
            last_error = err

            print(
                f"MySQL connection attempt {attempt} failed: {err}"
            )

            if connection is not None:
                try:
                    connection.close()
                except mysql.connector.Error:
                    pass

        if attempt < 3:
            time.sleep(2)

    if last_error:
        raise last_error

    raise RuntimeError("Unable to establish MySQL connection.")

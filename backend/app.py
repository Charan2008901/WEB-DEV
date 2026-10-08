from flask import Flask, request, jsonify
from flask_cors import CORS
from google.oauth2 import id_token
from google.auth.transport import requests
import os

from db import db

app = Flask(__name__)
CORS(app)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


@app.route("/")
def home():
    return "Java Learning Platform Python Backend is working!"


@app.route("/api/auth/google", methods=["POST"])
def google_login():

    data = request.get_json()

    token = data.get("token")

    if not token:
        return jsonify({
            "error": "Google token is required"
        }), 400

    try:

        # Verify Google ID token
        user_info = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )

        google_id = user_info["sub"]
        name = user_info.get("name")
        email = user_info.get("email")

        cursor = db.cursor(dictionary=True)

        # Check whether user already exists
        cursor.execute(
            "SELECT * FROM users WHERE google_id = %s",
            (google_id,)
        )

        user = cursor.fetchone()

        if user:

            cursor.close()

            return jsonify({
                "message": "Login successful",
                "user": user
            })

        # New user
        cursor.execute(
            """
            INSERT INTO users (name, email, google_id)
            VALUES (%s, %s, %s)
            """,
            (name, email, google_id)
        )

        db.commit()

        user_id = cursor.lastrowid

        cursor.close()

        return jsonify({
            "message": "Account created and login successful",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "google_id": google_id
            }
        }), 201

    except Exception as error:

        print("Google login error:", error)

        return jsonify({
            "error": "Google authentication failed"
        }), 401


if __name__ == "__main__":
    app.run(
        host="localhost",
        port=5000,
        debug=True
    )
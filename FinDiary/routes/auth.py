
from functools import wraps

from flask import Blueprint, jsonify, request, session

from db import get_connection

auth_bp = Blueprint("auth", __name__)


def api_error(message, status=400):
    return jsonify({"error": message}), status


def get_json():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object.")

    return data


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return api_error("Authentication required.", 401)

        return fn(*args, **kwargs)

    return wrapper


# Public registration is disabled.
@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    return api_error("Registration is disabled.", 403)


# Login using the existing public.users.password column.
@auth_bp.post("/api/auth/login")
def login():
    try:
        data = get_json()

        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))

        if not email or not password:
            return api_error("Email and password are required.")

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT user_id, email, password, full_name, role
                    FROM public.users
                    WHERE LOWER(email) = %s
                    """,
                    (email,),
                )
                user = cur.fetchone()

        if not user or user["password"] != password:
            return api_error("Invalid email or password.", 401)

        session.clear()
        session["user_id"] = user["user_id"]
        session["email"] = user["email"]
        session["full_name"] = user["full_name"]
        session["role"] = user["role"]
        session.permanent = True

        return jsonify({
            "message": "Login successful.",
            "user": {
                "user_id": user["user_id"],
                "email": user["email"],
                "full_name": user["full_name"],
                "role": user["role"],
            },
        })

    except ValueError as exc:
        return api_error(str(exc))

    except Exception:
        auth_bp.logger.exception("Login failed")
        return api_error("Login failed. Check server logs.", 500)


@auth_bp.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"message": "Logged out."})


@auth_bp.get("/api/auth/me")
@login_required
def me():
    return jsonify({
        "user": {
            "user_id": session["user_id"],
            "email": session["email"],
            "full_name": session["full_name"],
            "role": session["role"],
        }
    })

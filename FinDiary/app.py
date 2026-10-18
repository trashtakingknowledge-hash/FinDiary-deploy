import os
from pathlib import Path
from functools import wraps
from werkzeug.security import generate_password_hash
from werkzeug.security import check_password_hash

from flask import (
    Flask,
    render_template,
    redirect,
    request,
    session,
    jsonify,
    url_for,
)
from dotenv import load_dotenv
import httpx
from supabase import create_client, ClientOptions


# -------------------------------
# Environment configuration
# -------------------------------

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH, override=True)


app = Flask(__name__)

app.config.update(
    SECRET_KEY=os.getenv("FLASK_SECRET_KEY"),
    SESSION_PERMANENT=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,  # Localhost HTTP development only
)


if not app.secret_key:
    raise RuntimeError(
        f"FLASK_SECRET_KEY missing. Checked: {ENV_PATH}"
    )


# -------------------------------
# Supabase configuration
# -------------------------------

# -------------------------------
# Supabase configuration
# -------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = None
supabase_http_client = None

if SUPABASE_URL and SUPABASE_KEY:
    supabase_http_client = httpx.Client(
        http2=False,
        timeout=30.0,
    )

    supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
        options=ClientOptions(
            httpx_client=supabase_http_client
        ),
    )

# -------------------------------
# Authentication helper
# -------------------------------

def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api/"):
                return jsonify({
                    "message": "Please log in to continue."
                }), 401

            return redirect(url_for("login_page"))

        return view(*args, **kwargs)

    return wrapped_view


# -------------------------------
# Public pages
# -------------------------------

@app.get("/")
def home():
    return render_template("index.html")


@app.get("/login")
def login_page():
    if session.get("user_id"):
        return redirect(url_for("overview"))

    return render_template("login.html")


@app.get("/signup")
def signup_page():
    if session.get("user_id"):
        return redirect(url_for("overview"))

    return render_template("signup.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok"}), 200


# -------------------------------
# Login API
# -------------------------------

@app.post("/api/auth/login")
def login_api():
    if not supabase:
        return jsonify({
            "message": "Database configuration is missing."
        }), 500

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({
            "message": "Email and password are required."
        }), 400

    try:
        response = (
            supabase.table("users")
            .select("user_id, email, full_name, password")
            .eq("email", email)
            .limit(1)
            .execute()
        )

        users = response.data or []

        if not users:
            return jsonify({
                "message": "Invalid email or password."
            }), 401

        user = users[0]
        stored_password = user.get("password")

        password_valid = False

        if stored_password:
            try:
                password_valid = check_password_hash(
                    stored_password, password
                )
            except (ValueError, TypeError):
                password_valid = stored_password == password

        if not password_valid:
            return jsonify({
                "message": "Invalid email or password."
            }), 401

        session.clear()
        session["user_id"] = user["user_id"]
        session["email"] = user.get("email")
        session["full_name"] = user.get("full_name") or ""

        return jsonify({
            "message": "Login successful.",
            "user": {
                "user_id": user["user_id"],
                "email": user.get("email"),
                "full_name": user.get("full_name") or "",
            },
            "redirect_url": url_for("overview"),
        }), 200

    except Exception as exc:
        app.logger.exception("Login failed")
        return jsonify({
            "message": "Unable to log in.",
            "error": str(exc),
        }), 500


# -------------------------------
# Signup API
# -------------------------------




# -------------------------------
# Logout API
# -------------------------------

@app.post("/api/auth/logout")
def logout_api():
    session.clear()
    return jsonify({
        "message": "Logged out successfully.",
        "redirect_url": url_for("login_page"),
    }), 200


# -------------------------------
# Authentication status
# -------------------------------

@app.get("/api/auth/me")
def auth_me():
    if not session.get("user_id"):
        return jsonify({
            "authenticated": False,
        }), 200

    return jsonify({
        "authenticated": True,
        "user": {
            "user_id": session.get("user_id"),
            "email": session.get("email"),
            "full_name": session.get("full_name"),
        },
    }), 200


# -------------------------------
# Dashboard pages
# -------------------------------

@app.get("/overview")
@login_required
def overview():
    return render_template("overview.html")


@app.get("/transactions")
@login_required
def transactions_page():
    return render_template("transactions.html")


@app.get("/bills")
@login_required
def bills_page():
    return render_template("bills.html")


@app.get("/recurring")
@login_required
def recurring_page():
    return render_template("recurring.html")


@app.get("/goals")
@login_required
def goals_page():
    return render_template("goals.html")


# -------------------------------
# Helper functions
# -------------------------------

def current_user_id():
    return session.get("user_id")


def get_request_data():
    return request.get_json(silent=True) or {}


def parse_amount(value):
    try:
        amount = float(value)
        if amount < 0:
            return None
        return amount
    except (TypeError, ValueError):
        return None


def normalize_date(value):
    if not value:
        return None

    try:
        from datetime import date
        return date.fromisoformat(str(value)).isoformat()
    except (TypeError, ValueError):
        return None


def api_error(message, status=400, error=None):
    payload = {"message": message}
    if error is not None:
        payload["error"] = str(error)
    return jsonify(payload), status



@app.get("/api/categories")
@login_required
def get_categories():
    if not supabase:
        return jsonify({"message": "Database is not configured."}), 500

    try:
        result = (
            supabase.table("categories")
            .select("category_id, name, kind, color")
            .order("name")
            .execute()
        )

        return jsonify({"categories": result.data or []}), 200

    except Exception:
        app.logger.exception("Could not load categories")

        return jsonify({"message": "Could not load categories."}), 500
        
# -------------------------------
# Signup API
# -------------------------------

@app.post("/api/auth/signup")
def signup_api():
    if not supabase:
        return jsonify({
            "message": "Database configuration is missing."
        }), 500

    data = request.get_json(silent=True) or {}

    full_name = str(data.get("full_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    confirm_password = str(data.get("confirm_password", ""))

    if not full_name or not email or not password or not confirm_password:
        return jsonify({
            "message": "Please fill in all fields."
        }), 400

    if len(full_name) > 150:
        return jsonify({
            "message": "Full name must be 150 characters or fewer."
        }), 400

    if len(email) > 254 or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify({
            "message": "Please enter a valid email address."
        }), 400

    if len(password) < 8:
        return jsonify({
            "message": "Password must be at least 8 characters."
        }), 400

    if len(password) > 1024:
        return jsonify({
            "message": "Password is too long."
        }), 400

    if password != confirm_password:
        return jsonify({
            "message": "Passwords do not match."
        }), 400

    try:
        existing = (
            supabase.table("users")
            .select("user_id")
            .ilike("email", email)
            .limit(1)
            .execute()
        )

        if existing.data:
            return jsonify({
                "message": "This email is already registered. Please log in."
            }), 409

        password_hash = generate_password_hash(password)

        result = (
            supabase.table("users")
            .insert({
                "full_name": full_name,
                "email": email,
                "password": password_hash,
            })
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Account could not be created. Please try again."
            }), 500

        return jsonify({
            "success": True,
            "message": "Account created successfully. Please log in.",
            "redirect": url_for("login_page")
        }), 201

    except Exception:
        app.logger.exception("Signup API failed")
        return jsonify({
            "message": "Unable to create account right now. Please try again."
        }), 500


# -------------------------------
# Logout
# -------------------------------




@app.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))


# -------------------------------
# Overview page
# -------------------------------




# -------------------------------
# Overview API
# -------------------------------

# -------------------------------
# Overview API
# -------------------------------

@app.get("/api/overview")
@login_required
def overview_api():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    user_id = session["user_id"]

    try:
        # Fetch transactions, including category_id
        transaction_result = (
            supabase.table("transactions")
            .select(
                "transaction_id, txn_type, amount, currency_code, "
                "description, category_id, txn_date, created_at"
            )
            .eq("user_id", user_id)
            .order("txn_date", desc=True)
            .execute()
        )

        transactions = transaction_result.data or []

        # Fetch category names
        category_result = (
            supabase.table("categories")
            .select("category_id, name")
            .execute()
        )

        category_map = {
            str(cat["category_id"]): cat["name"]
            for cat in (category_result.data or [])
        }

        total_income = 0.0
        total_expenses = 0.0
        spending = {}

        for txn in transactions:
            amount = float(txn.get("amount") or 0)
            txn_type = str(txn.get("txn_type") or "").strip().lower()

            category_id = txn.get("category_id")
            category = category_map.get(
                str(category_id), "Uncategorized"
            ) if category_id is not None else "Uncategorized"

            if txn_type == "income":
                total_income += amount

            elif txn_type == "expense":
                total_expenses += amount
                spending[category] = (
                    spending.get(category, 0.0) + amount
                )

        # Fetch goals
        goals_result = (
            supabase.table("goals")
            .select(
                "goal_id, name, target_amount, saved_amount, "
                "currency_code, deadline"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        goals = goals_result.data or []

        # Fetch upcoming bills
        from datetime import date

        bills_result = (
            supabase.table("bills")
            .select(
                "bill_id, name, amount, currency_code, "
                "due_date, status, category"
            )
            .eq("user_id", user_id)
            .gte("due_date", date.today().isoformat())
            .order("due_date")
            .limit(4)
            .execute()
        )
        bills = bills_result.data or []

        recent_transactions = []
        for txn in transactions[:5]:
            category_id = txn.get("category_id")
            category = category_map.get(
                str(category_id), "Uncategorized"
            ) if category_id is not None else "Uncategorized"

            recent_transactions.append({
                "transaction_id": txn.get("transaction_id"),
                "description": txn.get("description") or "Transaction",
                "type": txn.get("txn_type") or "expense",
                "category": category,
                "amount": float(txn.get("amount") or 0),
                "date": txn.get("txn_date"),
                "currency_code": txn.get("currency_code") or "INR"
            })

        spending_breakdown = [
            {"category": category, "amount": amount}
            for category, amount in spending.items()
        ]

        goals_data = [
            {
                "goal_id": goal.get("goal_id"),
                "name": goal.get("name") or "Savings goal",
                "target_amount": float(goal.get("target_amount") or 0),
                "saved_amount": float(goal.get("saved_amount") or 0),
                "currency_code": goal.get("currency_code") or "INR",
                "deadline": goal.get("deadline")
            }
            for goal in goals
        ]

        upcoming_bills = [
            {
                "bill_id": bill.get("bill_id"),
                "name": bill.get("name") or "Bill",
                "amount": float(bill.get("amount") or 0),
                "currency_code": bill.get("currency_code") or "INR",
                "due_date": bill.get("due_date"),
                "status": bill.get("status"),
                "category": bill.get("category")
            }
            for bill in bills
        ]

        return jsonify({
            "total_balance": total_income - total_expenses,
            "total_income": total_income,
            "total_expenses": total_expenses,
            "total_savings": total_income - total_expenses,
            "recent_transactions": recent_transactions,
            "spending_breakdown": spending_breakdown,
            "goals": goals_data,
            "upcoming_bills": upcoming_bills
        }), 200

    except Exception:
        app.logger.exception("Could not load overview")
        return jsonify({
            "message": "Could not load your financial overview."
        }), 500


# -------------------------------
# Transactions page
# -------------------------------




# -------------------------------
# Transactions API
# -------------------------------
@app.get("/api/transactions")
@login_required
def get_transactions():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    try:
        result = (
            supabase.table("transactions")
            .select(
                "transaction_id,txn_type,amount,currency_code,"
                "description,category_id,txn_date,created_at,payment_method"
            )
            .eq("user_id", session["user_id"])
            .order("txn_date", desc=True)
            .execute()
        )

        category_result = (
            supabase.table("categories")
            .select("category_id, name, color")
            .execute()
        )

        category_map = {
            str(category["category_id"]): category
            for category in (category_result.data or [])
        }

        transactions = []

        for item in result.data or []:
            category = category_map.get(
                str(item.get("category_id"))
            )

            transactions.append({
                **item,
                "category_name": category["name"] if category else None,
                "category_color": category.get("color") if category else None
            })

        return jsonify({
            "transactions": transactions
        }), 200

    except Exception:
        app.logger.exception("Could not fetch transactions")
        return jsonify({
            "message": "Could not fetch transactions."
        }), 500


@app.post("/api/transactions")
@login_required
def create_transaction():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    data = request.get_json(silent=True) or {}

    txn_type = str(
        data.get("txn_type", data.get("type", ""))
    ).strip().upper()

    description = str(
        data.get("description", data.get("title", ""))
    ).strip()

    txn_date = str(
        data.get("txn_date", data.get("date", ""))
    ).strip()

    currency_code = str(
        data.get("currency_code", "INR")
    ).strip().upper()

    payment_method = str(
        data.get("payment_method", "")
    ).strip() or None

    category_id = data.get("category_id")

    # Validate amount
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter a valid amount."
        }), 400

    if txn_type not in ("INCOME", "EXPENSE"):
        return jsonify({
            "message": "Choose income or expense."
        }), 400

    if amount <= 0:
        return jsonify({
            "message": "Amount must be greater than zero."
        }), 400

    if not description:
        return jsonify({
            "message": "Enter a description."
        }), 400

    if len(description) > 500:
        return jsonify({
            "message": "Description is too long."
        }), 400

    # Validate transaction date
    from datetime import date

    try:
        date.fromisoformat(txn_date)
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter a valid transaction date."
        }), 400

    if len(currency_code) != 3:
        return jsonify({
            "message": "Currency code must have 3 letters."
        }), 400

    # Validate category
    if category_id in ("", None):
        category_id = None
    else:
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            return jsonify({
                "message": "Choose a valid category."
            }), 400

    # Save transaction
    try:
        payload = {
            "user_id": session["user_id"],
            "txn_type": txn_type,
            "amount": amount,
            "currency_code": currency_code,
            "description": description,
            "txn_date": txn_date,
            "category_id": category_id,
            "payment_method": payment_method
        }

        result = (
            supabase.table("transactions")
            .insert(payload)
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Transaction was not saved."
            }), 500

        return jsonify({
            "success": True,
            "message": "Transaction added successfully.",
            "transaction": result.data[0]
        }), 201

    except Exception:
        app.logger.exception("Could not save transaction")
        return jsonify({
            "message": "Could not save transaction."
        }), 500


@app.put("/api/transactions/<int:transaction_id>")
@login_required
def update_transaction(transaction_id):
    if not supabase:
        return jsonify({"message": "Database is not configured."}), 500

    data = request.get_json(silent=True) or {}

    txn_type = str(
        data.get("txn_type", data.get("type", ""))
    ).strip().upper()

    description = str(
        data.get("description", data.get("title", ""))
    ).strip()

    txn_date = str(
        data.get("txn_date", data.get("date", ""))
    ).strip()

    currency_code = str(
        data.get("currency_code", "INR")
    ).strip().upper()

    payment_method = str(
        data.get("payment_method", "")
    ).strip() or None

    category_id = data.get("category_id")

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"message": "Enter a valid amount."}), 400

    if txn_type not in ("INCOME", "EXPENSE"):
        return jsonify({"message": "Choose income or expense."}), 400

    if amount <= 0:
        return jsonify({"message": "Amount must be greater than zero."}), 400

    if not description or len(description) > 500:
        return jsonify({"message": "Enter a valid description."}), 400

    from datetime import date

    try:
        date.fromisoformat(txn_date)
    except (TypeError, ValueError):
        return jsonify({"message": "Enter a valid transaction date."}), 400

    if len(currency_code) != 3:
        return jsonify({"message": "Currency code must have 3 letters."}), 400

    if category_id in ("", None):
        category_id = None
    else:
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            return jsonify({"message": "Choose a valid category."}), 400

    try:
        # Verify ownership before updating
        existing = (
            supabase.table("transactions")
            .select("transaction_id")
            .eq("transaction_id", transaction_id)
            .eq("user_id", session["user_id"])
            .execute()
        )

        if not existing.data:
            return jsonify({"message": "Transaction not found."}), 404

        result = (
            supabase.table("transactions")
            .update({
                "txn_type": txn_type,
                "amount": amount,
                "currency_code": currency_code,
                "description": description,
                "txn_date": txn_date,
                "category_id": category_id,
                "payment_method": payment_method
            })
            .eq("transaction_id", transaction_id)
            .eq("user_id", session["user_id"])
            .execute()
        )

        if not result.data:
            return jsonify({"message": "Transaction was not updated."}), 500

        return jsonify({
            "success": True,
            "message": "Transaction updated successfully.",
            "transaction": result.data[0]
        }), 200

    except Exception:
        app.logger.exception("Could not update transaction")
        return jsonify({"message": "Could not update transaction."}), 500


@app.delete("/api/transactions/<int:transaction_id>")
@login_required
def delete_transaction(transaction_id):
    if not supabase:
        return jsonify({"message": "Database is not configured."}), 500

    try:
        result = (
            supabase.table("transactions")
            .delete()
            .eq("transaction_id", transaction_id)
            .eq("user_id", session["user_id"])
            .execute()
        )

        if not result.data:
            return jsonify({"message": "Transaction not found."}), 404

        return jsonify({
            "success": True,
            "message": "Transaction deleted successfully."
        }), 200

    except Exception:
        app.logger.exception("Could not delete transaction")
        return jsonify({"message": "Could not delete transaction."}), 500


# -------------------------------
# Bills API
# -------------------------------

@app.get("/api/bills")
@login_required
def get_bills():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    try:
        result = (
            supabase.table("bills")
            .select(
                "bill_id, name, amount, currency_code, due_date, "
                "status, category, notes, created_at"
            )
            .eq("user_id", session["user_id"])
            .order("due_date")
            .execute()
        )

        return jsonify({
            "bills": result.data or []
        }), 200

    except Exception:
        app.logger.exception("Could not load bills")
        return jsonify({
            "message": "Could not load bills."
        }), 500




@app.post("/api/bills")
@login_required
def create_bill():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    from datetime import date

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    due_date = str(data.get("due_date", "")).strip()
    category = str(data.get("category", "")).strip()
    category_id = data.get("category_id")
    status = str(data.get("status", "UNPAID")).strip().upper()
    notes = str(data.get("notes", "")).strip()
    currency_code = str(data.get("currency_code", "INR")).strip().upper()

    # Validate amount and due date
    try:
        amount = float(data.get("amount", 0))
        date.fromisoformat(due_date)
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter a valid amount and due date."
        }), 400

    if not name or amount <= 0:
        return jsonify({
            "message": "Bill name and a positive amount are required."
        }), 400

    if not due_date or len(currency_code) != 3:
        return jsonify({
            "message": "A valid due date and currency code are required."
        }), 400

    if status not in ("UNPAID", "PAID"):
        return jsonify({
            "message": "Invalid bill status."
        }), 400

    if status == "PAID":
        return jsonify({
            "message": (
                "Create the bill as UNPAID, then record payment "
                "using the payment modal."
            )
        }), 400

    # Resolve category ID if the frontend sends a category name
    if category_id not in (None, ""):
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            return jsonify({
                "message": "Invalid category."
            }), 400
    elif category:
        try:
            category_result = (
                supabase.table("categories")
                .select("category_id, name")
                .ilike("name", category)
                .limit(1)
                .execute()
            )

            if category_result.data:
                category_id = category_result.data[0]["category_id"]
        except Exception:
            app.logger.exception("Could not resolve bill category")
            return jsonify({
                "message": "Could not resolve bill category."
            }), 500

    try:
        result = (
            supabase.table("bills")
            .insert({
                "user_id": session["user_id"],
                "name": name,
                "amount": amount,
                "currency_code": currency_code,
                "due_date": due_date,
                "status": "UNPAID",
                "category": category or None,
                "category_id": category_id,
                "notes": notes or None,
            })
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Bill was not saved."
            }), 500

        return jsonify({
            "success": True,
            "message": "Bill added successfully.",
            "bill": result.data[0]
        }), 201

    except Exception:
        app.logger.exception("Could not create bill")
        return jsonify({
            "message": "Could not create bill."
        }), 500


@app.put("/api/bills/<int:bill_id>")
@login_required
def update_bill(bill_id):
    if not supabase:
        return jsonify({"message": "Database is not configured."}), 500

    from datetime import date

    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}
    updates = {}

    # Validate bill name
    if "name" in data:
        name = str(data["name"]).strip()

        if not name:
            return jsonify({"message": "Bill name is required."}), 400

        updates["name"] = name

    # Validate amount
    if "amount" in data:
        try:
            amount = float(data["amount"])
        except (TypeError, ValueError):
            return jsonify({"message": "Enter a valid amount."}), 400

        if amount <= 0:
            return jsonify({"message": "Amount must be positive."}), 400

        updates["amount"] = amount

    # Validate due date
    if "due_date" in data:
        due_date = str(data["due_date"]).strip()

        try:
            date.fromisoformat(due_date)
        except ValueError:
            return jsonify({"message": "Enter a valid due date."}), 400

        updates["due_date"] = due_date

    # Update category and notes
    for field in ("category", "notes"):
        if field in data:
            updates[field] = str(data[field]).strip() or None

    # Validate status
    if "status" in data:
        status = str(data["status"]).strip().upper()

        if status not in ("UNPAID", "PAID"):
            return jsonify({"message": "Invalid bill status."}), 400

        if status == "PAID":
            return jsonify({
                "message": "Use the payment flow to mark this bill as paid."
            }), 400

        updates["status"] = "UNPAID"

    # Validate currency
    if "currency_code" in data:
        currency = str(data["currency_code"]).strip().upper()

        if len(currency) != 3:
            return jsonify({"message": "Invalid currency code."}), 400

        updates["currency_code"] = currency

    if not updates:
        return jsonify({"message": "No valid changes supplied."}), 400

    try:
        bill_result = (
            supabase.table("bills")
            .select("bill_id, status")
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not bill_result.data:
            return jsonify({"message": "Bill not found."}), 404

        old_status = str(
            bill_result.data[0].get("status") or "UNPAID"
        ).upper()

        result = (
            supabase.table("bills")
            .update(updates)
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return jsonify({"message": "Bill could not be updated."}), 500

        if updates.get("status") == "UNPAID":
            linked_transaction = (
                supabase.table("transactions")
                .select("transaction_id")
                .eq("source_bill_id", bill_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )

            if linked_transaction.data:
                (
                    supabase.table("transactions")
                    .delete()
                    .eq("source_bill_id", bill_id)
                    .eq("user_id", user_id)
                    .execute()
                )

        latest_bill = (
            supabase.table("bills")
            .select("*")
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        return jsonify({
            "success": True,
            "message": (
                "Bill marked unpaid and linked transaction removed."
                if updates.get("status") == "UNPAID"
                and old_status == "PAID"
                else "Bill updated successfully."
            ),
            "bill": (
                latest_bill.data[0]
                if latest_bill.data
                else result.data[0]
            )
        }), 200

    except Exception:
        app.logger.exception("Could not update bill")
        return jsonify({
            "message": "Could not update bill. Check Flask server logs."
        }), 500


@app.post("/api/bills/<int:bill_id>/mark-paid")
@login_required
def mark_bill_paid_with_transaction(bill_id):
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500
    
    from datetime import date

    data = request.get_json(silent=True) or {}
    payment_method = str(
        data.get("payment_method", "")
    ).strip()

    if not payment_method:
        return jsonify({
            "message": "Please select a payment method."
        }), 400

    user_id = session["user_id"]

    try:
        # Get the bill belonging to this user
        bill_result = (
            supabase.table("bills")
            .select(
                "bill_id, name, amount, currency_code, "
                "due_date, status, category, category_id"
            )
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not bill_result.data:
            return jsonify({
                "message": "Bill not found."
            }), 404

        bill = bill_result.data[0]

        if str(bill.get("status") or "").upper() == "PAID":
            return jsonify({
                "message": "This bill is already marked as paid."
            }), 409

        # Create an expense transaction linked to this bill.
        transaction_result = (
            supabase.table("transactions")
            .insert({
                "user_id": user_id,
                "category_id": bill.get("category_id"),
                "txn_type": "EXPENSE",
                "amount": float(bill["amount"]),
                "currency_code": bill.get("currency_code") or "INR",
                "description": bill.get("name") or "Bill payment",
                "txn_date": date.today().isoformat(),
                "payment_method": payment_method,
                "source_bill_id": bill_id
            })
            .execute()
        )

        if not transaction_result.data:
            return jsonify({
                "message": "Could not create payment transaction."
            }), 500

        transaction_id = transaction_result.data[0]["transaction_id"]

        update_result = (
            supabase.table("bills")
            .update({
                "status": "PAID",
                "payment_method": payment_method
            })
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not update_result.data:
            return jsonify({
                "message": (
                    "Transaction was created, but the bill status "
                    "could not be updated. Check the database."
                ),
                "transaction_id": transaction_id
            }), 500

        return jsonify({
            "success": True,
            "message": "Bill marked paid and transaction recorded.",
            "transaction_id": transaction_id,
            "bill": update_result.data[0]
        }), 200

    except Exception:
        app.logger.exception("Could not mark bill paid")
        return jsonify({
            "message": "Could not mark bill paid. Check Flask server logs."
        }), 500


    except Exception:
        app.logger.exception("Could not mark bill paid")
        return jsonify({
            "message": "Could not mark bill paid. Check Flask server logs."
        }), 500


@app.delete("/api/bills/<int:bill_id>")
@login_required
def delete_bill(bill_id):
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    user_id = session["user_id"]

    try:
        existing = (
            supabase.table("bills")
            .select("bill_id")
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not existing.data:
            return jsonify({
                "message": "Bill not found."
            }), 404

        (
            supabase.table("transactions")
            .delete()
            .eq("source_bill_id", bill_id)
            .eq("user_id", user_id)
            .execute()
        )

        result = (
            supabase.table("bills")
            .delete()
            .eq("bill_id", bill_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Bill could not be deleted."
            }), 500

        return jsonify({
            "success": True,
            "message": "Bill and linked transaction deleted."
        }), 200

    except Exception:
        app.logger.exception("Could not delete bill")
        return jsonify({
            "message": "Could not delete bill."
        }), 500


# -------------------------------
# Recurring transactions API
# -------------------------------

@app.get("/api/recurring")
@login_required
def get_recurring_transactions():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    try:
        result = (
            supabase.table("recurring_transactions")
            .select("*")
            .eq("user_id", session["user_id"])
            .order("next_due_date")
            .execute()
        )

        return jsonify({
            "recurring": result.data or []
        }), 200

    except Exception:
        app.logger.exception("Could not load recurring transactions")
        return jsonify({
            "message": "Could not load recurring transactions."
        }), 500


@app.post("/api/recurring")
@login_required
def create_recurring_transaction():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    from datetime import date

    data = request.get_json(silent=True) or {}

    description = str(
    data.get("description") or data.get("title") or ""
    ).strip()
    txn_type = str(
        data.get("txn_type", data.get("type", "EXPENSE"))
    ).strip().upper()
    frequency = str(data.get("frequency", "MONTHLY")).strip().upper()
    start_date = str(data.get("start_date", "")).strip()
    end_date = str(data.get("end_date", "")).strip()
    next_due_date = str(data.get("next_due_date", "")).strip()
    currency_code = str(data.get("currency_code", "INR")).strip().upper()
    category_id = data.get("category_id")

    try:
        amount = float(data.get("amount") or 0)
        start_date_obj = date.fromisoformat(start_date)
        next_due_date_obj = date.fromisoformat(next_due_date)
        end_date_obj = date.fromisoformat(end_date) if end_date else None
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter valid amount, start date, and next due date."
        }), 400

    if end_date_obj and end_date_obj < start_date_obj:
        return jsonify({
            "message": "End date cannot be before start date."
        }), 400
    if not description or amount <= 0:
        return jsonify({
            "message": "Description and a positive amount are required."
        }), 400

    if txn_type not in ("INCOME", "EXPENSE"):
        return jsonify({
            "message": "Choose income or expense."
        }), 400

    if frequency not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return jsonify({
            "message": "Invalid recurring frequency."
        }), 400

    if len(currency_code) != 3:
        return jsonify({
            "message": "Invalid currency code."
        }), 400

    if category_id in ("", None):
        category_id = None
    else:
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            return jsonify({
                "message": "Invalid category."
            }), 400

    try:
        payload = {
            "user_id": session["user_id"],
            "description": description,
            "txn_type": txn_type,
            "amount": amount,
            "currency_code": currency_code,
            "frequency": frequency,
            "start_date": start_date_obj.isoformat(),
            "end_date": end_date_obj.isoformat() if end_date_obj else None,
            "next_due_date": next_due_date_obj.isoformat(),
            "is_active": "Y",
            "category_id": category_id
        }

        result = (
            supabase.table("recurring_transactions")
            .insert(payload)
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Recurring transaction was not saved."
            }), 500

        return jsonify({
            "success": True,
            "message": "Recurring transaction added.",
            "recurring": result.data[0]
        }), 201

    except Exception:
        app.logger.exception("Could not create recurring transaction")
        return jsonify({
            "message": "Could not create recurring transaction."
        }), 500


@app.put("/api/recurring/<int:recurring_id>")
@login_required
def edit_recurring_transaction(recurring_id):
    if not supabase:
        return jsonify({"message": "Database is not configured."}), 500

    from datetime import date

    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}

    try:
        existing_result = (
            supabase.table("recurring_transactions")
            .select("*")
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not existing_result.data:
            return jsonify({
                "message": "Recurring transaction not found."
            }), 404

        existing = existing_result.data[0]
        payload = {}

        # Update only fields supplied by the frontend.
        if "description" in data or "title" in data:
            description = str(
                data.get("description") or data.get("title") or ""
            ).strip()

            if not description:
                return jsonify({
                    "message": "Description is required."
                }), 400

            payload["description"] = description

        if "amount" in data:
            try:
                amount = float(data["amount"])
                if amount <= 0:
                    raise ValueError()
                payload["amount"] = amount
            except (TypeError, ValueError):
                return jsonify({"message": "Enter a valid amount."}), 400

        if "txn_type" in data or "type" in data:
            txn_type = str(
                data.get("txn_type", data.get("type", "EXPENSE"))
            ).strip().upper()
            if txn_type not in ("INCOME", "EXPENSE"):
                return jsonify({"message": "Invalid transaction type."}), 400
            payload["txn_type"] = txn_type

        if "frequency" in data:
            frequency = str(data["frequency"]).strip().upper()
            if frequency not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
                return jsonify({"message": "Invalid frequency."}), 400
            payload["frequency"] = frequency

        if "category_id" in data:
            category_id = data["category_id"]
            if category_id in ("", None):
                payload["category_id"] = None
            else:
                try:
                    payload["category_id"] = int(category_id)
                except (TypeError, ValueError):
                    return jsonify({"message": "Invalid category."}), 400

        if "currency_code" in data:
            currency_code = str(data["currency_code"]).strip().upper()
            if len(currency_code) != 3:
                return jsonify({"message": "Invalid currency code."}), 400
            payload["currency_code"] = currency_code

        for field in ("start_date", "end_date", "next_due_date"):
            if field in data:
                value = str(data[field] or "").strip()

                if not value:
                    if field == "end_date":
                        payload[field] = None
                        continue
                    return jsonify({
                        "message": f"{field} is required."
                    }), 400

                try:
                    payload[field] = date.fromisoformat(value).isoformat()
                except ValueError:
                    return jsonify({
                        "message": f"Invalid {field}."
                    }), 400

        start_value = payload.get(
            "start_date", existing.get("start_date")
        )
        end_value = payload.get(
            "end_date", existing.get("end_date")
        )

        if start_value and end_value and end_value < start_value:
            return jsonify({
                "message": "End date cannot be before start date."
            }), 400

        if not payload:
            return jsonify({
                "message": "No changes were provided."
            }), 400

        result = (
            supabase.table("recurring_transactions")
            .update(payload)
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .execute()
        )

        return jsonify({
            "success": True,
            "message": "Recurring transaction updated.",
            "recurring": result.data[0] if result.data else payload
        }), 200

    except Exception:
        app.logger.exception("Could not edit recurring transaction")
        return jsonify({
            "message": "Could not update recurring transaction."
        }), 500

from datetime import date
import calendar


def get_next_recurring_date(current_date, frequency):
    if frequency == "DAILY":
        from datetime import timedelta
        return current_date + timedelta(days=1)

    if frequency == "WEEKLY":
        from datetime import timedelta
        return current_date + timedelta(weeks=1)

    if frequency == "MONTHLY":
        year = current_date.year + (current_date.month // 12)
        month = (current_date.month % 12) + 1
        day = min(
            current_date.day,
            calendar.monthrange(year, month)[1]
        )
        return date(year, month, day)

    if frequency == "YEARLY":
        year = current_date.year + 1
        day = min(
            current_date.day,
            calendar.monthrange(year, current_date.month)[1]
        )
        return date(year, current_date.month, day)

    raise ValueError("Unsupported frequency")


def generate_recurring_due_dates(start_date, end_date, frequency):
    dates = []
    current = start_date

    while end_date is None or current <= end_date:
        dates.append(current)

        # Prevent an unlimited loop when there is no end date.
        # For an open-ended recurring transaction, generate a finite window
        # elsewhere instead of calling this without an end date.
        if end_date is None:
            break

        next_date = get_next_recurring_date(current, frequency)

        if next_date <= current:
            raise ValueError("Recurring frequency did not advance the date.")

        current = next_date

    return dates


def sync_recurring_payment_history(recurring):
    from datetime import date

    recurring_id = recurring["recurring_id"]
    user_id = recurring["user_id"]
    start_date = date.fromisoformat(str(recurring["start_date"])[:10])
    end_value = recurring.get("end_date")
    end_date = (
        date.fromisoformat(str(end_value)[:10])
        if end_value else None
    )

    due_dates = generate_recurring_due_dates(
        start_date,
        end_date,
        recurring["frequency"]
    )

    # Preserve existing payment records and their statuses.
    for due_date in due_dates:
        supabase.table("recurring_payment_history").upsert(
            {
                "recurring_id": recurring_id,
                "user_id": user_id,
                "due_date": due_date.isoformat(),
                "amount": float(recurring["amount"]),
                "payment_status": "UNPAID"
            },
            on_conflict="recurring_id,due_date",
            ignore_duplicates=True
        ).execute()

    # Remove only unpaid occurrences outside the updated schedule.
    history = (
        supabase.table("recurring_payment_history")
        .select("payment_id, due_date, payment_status, transaction_id")
        .eq("recurring_id", recurring_id)
        .eq("user_id", user_id)
        .execute()
    )

    valid_dates = {d.isoformat() for d in due_dates}

    for row in history.data or []:
        row_date = str(row["due_date"])[:10]
        is_outside_schedule = row_date not in valid_dates
        is_unpaid = str(row.get("payment_status", "")).upper() == "UNPAID"
        has_no_transaction = row.get("transaction_id") is None

        if is_outside_schedule and is_unpaid and has_no_transaction:
            (
                supabase.table("recurring_payment_history")
                .delete()
                .eq("payment_id", row["payment_id"])
                .eq("user_id", user_id)
                .execute()
            )


from datetime import date

def get_next_upcoming_due_date(current_due, frequency):
    frequency = str(frequency).strip().upper()

    if frequency == "WEEKLY":
        from datetime import timedelta
        return current_due + timedelta(days=7)

    if frequency == "MONTHLY":
        from dateutil.relativedelta import relativedelta
        return current_due + relativedelta(months=1)

    if frequency == "QUARTERLY":
        from dateutil.relativedelta import relativedelta
        return current_due + relativedelta(months=3)

    if frequency == "YEARLY":
        from dateutil.relativedelta import relativedelta
        return current_due + relativedelta(years=1)

    raise ValueError(f"Unsupported recurring frequency: {frequency}")



@app.post("/api/recurring/<int:recurring_id>/payment")
@login_required
def update_recurring_payment(recurring_id):
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}

    payment_status = str(
        data.get("payment_status", "")
    ).strip().upper()

    due_date_value = str(data.get("due_date", "")).strip()
    payment_method = str(
        data.get("payment_method", "")
    ).strip() or None

    if payment_status not in ("PAID", "UNPAID"):
        return jsonify({
            "message": "Payment status must be PAID or UNPAID."
        }), 400

    try:
        due_date = date.fromisoformat(due_date_value)
    except (TypeError, ValueError):
        return jsonify({
            "message": "A valid due date is required."
        }), 400

    if payment_status == "PAID" and not payment_method:
        return jsonify({
            "message": "Please select a payment method."
        }), 400

    try:
        recurring_result = (
            supabase.table("recurring_transactions")
            .select("*")
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not recurring_result.data:
            return jsonify({
                "message": "Recurring transaction not found."
            }), 404

        recurring = recurring_result.data[0]

        existing_history = (
            supabase.table("recurring_payment_history")
            .select("*")
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .eq("due_date", due_date.isoformat())
            .limit(1)
            .execute()
        )

        existing = (
            existing_history.data[0]
            if existing_history.data
            else {}
        )

        transaction_id = existing.get("transaction_id")
    
        if payment_status == "PAID":
            if transaction_id:
                # Reuse the existing linked transaction.
                transaction_result = (
                    supabase.table("transactions")
                    .update({
                        "amount": float(recurring["amount"]),
                        "currency_code": recurring.get("currency_code") or "INR",
                        "description": recurring.get("description") or "Recurring payment",
                        "txn_type": recurring.get("txn_type") or "EXPENSE",
                        "txn_date": date.today().isoformat(),
                        "category_id": recurring.get("category_id"),
                        "payment_method": payment_method
                    })
                    .eq("transaction_id", transaction_id)
                    .eq("user_id", user_id)
                    .execute()
                )
            else:
                transaction_result = (
                    supabase.table("transactions")
                    .insert({
                        "user_id": user_id,
                        "category_id": recurring.get("category_id"),
                        "txn_type": recurring.get("txn_type") or "EXPENSE",
                        "amount": float(recurring["amount"]),
                        "currency_code": recurring.get("currency_code") or "INR",
                        "description": recurring.get("description") or "Recurring payment",
                        "txn_date": date.today().isoformat(),
                        "payment_method": payment_method,
                        "source_recurring_id": recurring_id
                    })
                    .execute()
                )

                if not transaction_result.data:
                    return jsonify({
                        "message": "Could not create the transaction."
                    }), 500

                transaction_id = transaction_result.data[0]["transaction_id"]

            history_payload = {
                "recurring_id": recurring_id,
                "user_id": user_id,
                "due_date": due_date.isoformat(),
                "amount": float(recurring["amount"]),
                "payment_status": "PAID",
                "payment_method": payment_method,
                "transaction_id": transaction_id
            }

            supabase.table("recurring_payment_history").upsert(
                history_payload,
                on_conflict="recurring_id,due_date"
            ).execute()

                            
            
            
            history_result = (
                supabase.table("recurring_payment_history")
                .select("due_date, payment_status")
                .eq("recurring_id", recurring_id)
                .eq("user_id", user_id)
                .gte("due_date", due_date.isoformat())
                .order("due_date")
                .execute()
            )

            unpaid_dates = [
                date.fromisoformat(str(row["due_date"])[:10])
                for row in (history_result.data or [])
                if str(row.get("payment_status", "")).upper() == "UNPAID"
            ]

            if unpaid_dates:
                next_due_date = min(unpaid_dates)
            else:
                next_due_date = get_next_recurring_date(
                    due_date,
                    recurring["frequency"]
                )

            end_value = recurring.get("end_date")

            if end_value:
                end_date = date.fromisoformat(str(end_value)[:10])

                if next_due_date > end_date:
                    next_due_date = end_date

            supabase.table("recurring_transactions").update({
                "payment_status": "PAID",
                "payment_method": payment_method,
                "last_payment_date": due_date.isoformat(),
                "next_due_date": next_due_date.isoformat()
            }).eq(
                "recurring_id", recurring_id
            ).eq(
                "user_id", user_id
            ).execute()

            return jsonify({
                "success": True,
                "message": "Payment marked paid and transaction recorded.",
                "transaction_id": transaction_id,
                "next_due_date": next_due_date.isoformat()
            }), 200




        # UNPAID: remove only the transaction linked to this occurrence.
        if transaction_id:
            supabase.table("transactions").delete().eq(
                "transaction_id", transaction_id
            ).eq(
                "user_id", user_id
            ).execute()

        history_payload = {
            "recurring_id": recurring_id,
            "user_id": user_id,
            "due_date": due_date.isoformat(),
            "amount": float(recurring["amount"]),
            "payment_status": "UNPAID",
            "payment_method": None,
            "transaction_id": None
        }

        supabase.table("recurring_payment_history").upsert(
            history_payload,
            on_conflict="recurring_id,due_date"
        ).execute()

        
        history_result = (
            supabase.table("recurring_payment_history")
            .select("due_date, payment_status")
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .order("due_date")
            .execute()
        )

        unpaid_dates = [
            date.fromisoformat(str(row["due_date"])[:10])
            for row in (history_result.data or [])
            if str(row.get("payment_status", "")).upper() == "UNPAID"
        ]

        if unpaid_dates:
            next_due_date = min(unpaid_dates)
        else:
            next_due_date = date.fromisoformat(
                str(recurring["next_due_date"])[:10]
            )

        supabase.table("recurring_transactions").update({
            "payment_status": "UNPAID",
            "payment_method": None,
            "next_due_date": next_due_date.isoformat()
        }).eq(
            "recurring_id", recurring_id
        ).eq(
            "user_id", user_id
        ).execute()


        return jsonify({
            "success": True,
            "message": "Payment marked unpaid and linked transaction removed."
        }), 200

    except Exception:
        app.logger.exception("Could not update recurring payment")
        return jsonify({
            "message": "Could not update payment. Check Flask server logs."
        }), 500


@app.get("/api/recurring/<int:recurring_id>/payments")
@login_required
def get_recurring_payment_history(recurring_id):
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    user_id = session["user_id"]

    try:
        # Verify ownership
        result = (
            supabase.table("recurring_transactions")
            .select("*")
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Recurring transaction not found."
            }), 404

        recurring = result.data[0]

        # Pagination parameters
        try:
            page = max(1, int(request.args.get("page", 1)))
            per_page = min(
                50,
                max(1, int(request.args.get("per_page", 5)))
            )
        except (TypeError, ValueError):
            return jsonify({
                "message": "Invalid pagination parameters."
            }), 400

        start = (page - 1) * per_page
        end = start + per_page - 1

        # Ensure current due date exists.
        # ignore_duplicates prevents overwriting PAID records.
        current_due = date.fromisoformat(
            str(recurring["next_due_date"])[:10]
        )

        supabase.table("recurring_payment_history").upsert(
            {
                "recurring_id": recurring_id,
                "user_id": user_id,
                "due_date": current_due.isoformat(),
                "amount": float(recurring["amount"]),
                "payment_status": "UNPAID"
            },
            on_conflict="recurring_id,due_date",
            ignore_duplicates=True
        ).execute()

        # Create the next 11 occurrences, preserving existing records.
        
        # Generate history only within the configured date range.
        start_value = recurring.get("start_date")
        end_value = recurring.get("end_date")

        if start_value:
            due_date = date.fromisoformat(str(start_value)[:10])
        else:
            due_date = current_due

        end_date = (
            date.fromisoformat(str(end_value)[:10])
            if end_value else None
        )

        if end_date:
            # Finite schedule: include every occurrence through the end date.
            while due_date <= end_date:
                supabase.table("recurring_payment_history").upsert(
                    {
                        "recurring_id": recurring_id,
                        "user_id": user_id,
                        "due_date": due_date.isoformat(),
                        "amount": float(recurring["amount"]),
                        "payment_status": "UNPAID"
                    },
                    on_conflict="recurring_id,due_date",
                    ignore_duplicates=True
                ).execute()

                next_date = get_next_recurring_date(
                    due_date,
                    recurring["frequency"]
                )
                if next_date <= due_date:
                    break
                due_date = next_date
        else:
            # No end date: create only the next 11 future occurrences.
            due_date = current_due

            for _ in range(11):
                due_date = get_next_recurring_date(
                    due_date,
                    recurring["frequency"]
                )

                supabase.table("recurring_payment_history").upsert(
                    {
                        "recurring_id": recurring_id,
                        "user_id": user_id,
                        "due_date": due_date.isoformat(),
                        "amount": float(recurring["amount"]),
                        "payment_status": "UNPAID"
                    },
                    on_conflict="recurring_id,due_date",
                    ignore_duplicates=True
                ).execute()


        # Fetch only the requested page.
        history = (
            supabase.table("recurring_payment_history")
            .select(
                "payment_id, recurring_id, user_id, due_date, "
                "amount, payment_status, payment_method, transaction_id",
                count="exact"
            )
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .order("due_date")
            .range(start, end)
            .execute()
        )

        return jsonify({
            "payments": history.data or [],
            "total": history.count or 0,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception:
        app.logger.exception(
            "Could not load recurring payment history"
        )
        return jsonify({
            "message": "Could not load payment history."
        }), 500


@app.delete("/api/recurring/<int:recurring_id>")
@login_required
def delete_recurring_transaction(recurring_id):
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    user_id = session["user_id"]

    try:
        existing = (
            supabase.table("recurring_transactions")
            .select("recurring_id")
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not existing.data:
            return jsonify({
                "message": "Recurring transaction not found."
            }), 404

        (
            supabase.table("transactions")
            .delete()
            .eq("source_recurring_id", recurring_id)
            .eq("user_id", user_id)
            .execute()
        )

        (
            supabase.table("recurring_payment_history")
            .delete()
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .execute()
        )

        result = (
            supabase.table("recurring_transactions")
            .delete()
            .eq("recurring_id", recurring_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Recurring transaction could not be deleted."
            }), 500

        return jsonify({
            "success": True,
            "message": (
                "Recurring transaction, linked transactions, "
                "and payment history deleted successfully."
            )
        }), 200

    except Exception:
        app.logger.exception("Could not delete recurring transaction")
        return jsonify({
            "message": "Could not delete recurring transaction."
        }), 500


# -------------------------------
# Goals API
# -------------------------------

@app.get("/api/goals")
@login_required
def get_goals():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    try:
        result = (
            supabase.table("goals")
            .select(
                "goal_id, user_id, name, target_amount, "
                "saved_amount, currency_code, deadline, color, "
                "status, description, created_at"
            )
            .eq("user_id", session["user_id"])
            .order("created_at", desc=True)
            .execute()
        )

        return jsonify({
            "goals": result.data or []
        }), 200

    except Exception:
        app.logger.exception("Could not load goals")
        return jsonify({
            "message": "Could not load goals."
        }), 500


@app.post("/api/goals")
@login_required
def create_goal():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    color = str(data.get("color", "#8B5CF6")).strip()
    description = str(
    data.get("description") or data.get("title") or ""
    ).strip()
    status = str(data.get("status", "ACTIVE")).strip().upper()
    deadline = data.get("deadline") or data.get("target_date") or None

    if status == "COMPLETE":
        status = "COMPLETED"

    if not name:
        return jsonify({
            "message": "Enter a goal name."
        }), 400

    if status not in ("ACTIVE", "PAUSED", "COMPLETED"):
        return jsonify({
            "message": "Invalid goal status."
        }), 400

    try:
        target_amount = float(data.get("target_amount", 0))
        saved_amount = float(data.get("saved_amount", 0))
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter valid goal amounts."
        }), 400

    if target_amount <= 0 or saved_amount < 0:
        return jsonify({
            "message": "Enter valid goal amounts."
        }), 400

    if saved_amount > target_amount:
        return jsonify({
            "message": "Saved amount cannot exceed the target amount."
        }), 400

    if deadline:
        from datetime import date

        try:
            deadline = date.fromisoformat(
                str(deadline)[:10]
            ).isoformat()
        except ValueError:
            return jsonify({
                "message": "Enter a valid target date."
            }), 400

    try:
        result = (
            supabase.table("goals")
            .insert({
                "user_id": session["user_id"],
                "name": name,
                "target_amount": target_amount,
                "saved_amount": saved_amount,
                "deadline": deadline,
                "color": color,
                "currency_code": "INR",
                "status": status,
                "description": description
            })
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Goal was not saved."
            }), 500

        return jsonify({
            "success": True,
            "message": "Goal created successfully.",
            "goal": result.data[0]
        }), 201

    except Exception:
        app.logger.exception("Could not create goal")
        return jsonify({
            "message": "Could not create goal."
        }), 500


@app.put("/api/goals/<int:goal_id>")
@login_required
def update_goal(goal_id):
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    description = str(
    data.get("description") or data.get("title") or ""
).strip()
    status = str(data.get("status", "ACTIVE")).strip().upper()

    if status == "COMPLETE":
        status = "COMPLETED"

    try:
        target_amount = float(data.get("target_amount", 0))
        saved_amount = float(data.get("saved_amount", 0))
    except (TypeError, ValueError):
        return jsonify({
            "message": "Enter valid goal amounts."
        }), 400

    if not name:
        return jsonify({
            "message": "Please enter a goal name."
        }), 400

    if target_amount <= 0 or saved_amount < 0:
        return jsonify({
            "message": "Enter valid goal amounts."
        }), 400

    if saved_amount > target_amount:
        return jsonify({
            "message": "Saved amount cannot exceed the target amount."
        }), 400

    if status not in ("ACTIVE", "PAUSED", "COMPLETED"):
        return jsonify({
            "message": "Invalid goal status."
        }), 400

    from datetime import date

    deadline = data.get("target_date") or data.get("deadline") or None

    if deadline:
        try:
            deadline = date.fromisoformat(
                str(deadline)[:10]
            ).isoformat()
        except ValueError:
            return jsonify({
                "message": "Enter a valid target date."
            }), 400

    try:
        existing = (
            supabase.table("goals")
            .select("goal_id")
            .eq("goal_id", goal_id)
            .eq("user_id", session["user_id"])
            .limit(1)
            .execute()
        )

        if not existing.data:
            return jsonify({
                "message": "Goal not found."
            }), 404

        result = (
            supabase.table("goals")
            .update({
                "name": name,
                "target_amount": target_amount,
                "saved_amount": saved_amount,
                "deadline": deadline,
                "status": status,
                "description": description
            })
            .eq("goal_id", goal_id)
            .eq("user_id", session["user_id"])
            .execute()
        )

        if not result.data:
            return jsonify({
                "message": "Goal was not updated."
            }), 500

        return jsonify({
            "success": True,
            "message": "Goal updated successfully."
        }), 200

    except Exception:
        app.logger.exception("Could not update financial goal")
        return jsonify({
            "message": "Could not update goal. Check the server logs."
        }), 500


# -------------------------------
# Insights page
# -------------------------------

@app.get("/insights")
@login_required
def insights_page():
    return render_template("insights.html")


# -------------------------------
# Profile page
# -------------------------------

@app.get("/profile")
@login_required
def profile_page():
    return render_template(
        "profile.html",
        active_page="profile"
    )


# -------------------------------
# Change password API
# -------------------------------

@app.post("/api/auth/change-password")
@login_required
def change_password_api():
    if not supabase:
        return jsonify({
            "message": "Database is not configured."
        }), 500

    data = request.get_json(silent=True) or {}

    current_password = str(data.get("current_password", ""))
    new_password = str(data.get("new_password", ""))
    confirm_password = str(data.get("confirm_password", ""))

    if not current_password or not new_password or not confirm_password:
        return jsonify({
            "message": "Please fill in all password fields."
        }), 400

    if len(new_password) < 8:
        return jsonify({
            "message": "New password must be at least 8 characters."
        }), 400

    if new_password != confirm_password:
        return jsonify({
            "message": "New password and confirmation do not match."
        }), 400

    if current_password == new_password:
        return jsonify({
            "message": "New password must differ from your current password."
        }), 400

    try:
        user_id = session["user_id"]

        result = (
            supabase.table("users")
            .select("user_id, password")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        users = result.data or []

        if not users:
            return jsonify({
                "message": "User account not found."
            }), 404

        user = users[0]
        stored_password = str(user.get("password") or "")

        try:
            current_password_valid = check_password_hash(
                stored_password,
                current_password
            )
        except (ValueError, TypeError):
            current_password_valid = False

        if not current_password_valid:
            return jsonify({
                "message": "Current password is incorrect."
            }), 400

        update_result = (
            supabase.table("users")
            .update({
                "password": generate_password_hash(new_password)
            })
            .eq("user_id", user_id)
            .execute()
        )

        if not update_result.data:
            return jsonify({
                "message": "Password could not be updated."
            }), 500

        return jsonify({
            "success": True,
            "message": "Password updated successfully."
        }), 200

    except Exception:
        app.logger.exception("Could not change password")
        return jsonify({
            "message": "Unable to update password right now."
        }), 500


# -------------------------------
# Update profile API
# -------------------------------

@app.post("/api/auth/update-profile")
@login_required
def update_profile_api():
    if not supabase:
        return jsonify({
            "success": False,
            "message": "Database is not configured."
        }), 500

    data = request.get_json(silent=True) or {}

    full_name = str(data.get("full_name") or "").strip()
    email = str(data.get("email") or "").strip().lower()

    if not full_name or not email:
        return jsonify({
            "success": False,
            "message": "Full name and email are required."
        }), 400

    if len(full_name) > 100:
        return jsonify({
            "success": False,
            "message": "Full name must be 100 characters or fewer."
        }), 400

    import re

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({
            "success": False,
            "message": "Please enter a valid email address."
        }), 400

    try:
        user_id = session["user_id"]

        existing = (
            supabase.table("users")
            .select("user_id")
            .eq("email", email)
            .limit(2)
            .execute()
        )

        for account in existing.data or []:
            if str(account["user_id"]) != str(user_id):
                return jsonify({
                    "success": False,
                    "message": "This email is already registered."
                }), 409

        result = (
            supabase.table("users")
            .update({
                "full_name": full_name,
                "email": email
            })
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            return jsonify({
                "success": False,
                "message": "Profile could not be updated."
            }), 500

        session["full_name"] = full_name
        session["email"] = email

        return jsonify({
            "success": True,
            "message": "Personal information updated successfully."
        }), 200

    except Exception:
        app.logger.exception("Profile update failed")
        return jsonify({
            "success": False,
            "message": "Unable to update profile right now."
        }), 500


# -------------------------------
# Run application
# -------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )        
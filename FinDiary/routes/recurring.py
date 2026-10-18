from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, session, current_app

from db import get_connection
from routes.auth import login_required, api_error, get_json


recurring_bp = Blueprint("recurring", __name__)


ALLOWED_TYPES = {"INCOME", "EXPENSE"}
ALLOWED_FREQUENCIES = {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}


def parse_amount(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Amount must be a valid number.")

    if not amount.is_finite() or amount <= 0:
        raise ValueError("Amount must be greater than zero.")

    return amount


def parse_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError("Dates must use YYYY-MM-DD format.")


def serialize_rows(rows):
    result = []

    for row in rows:
        item = {}

        for key, value in row.items():
            if isinstance(value, Decimal):
                value = float(value)
            elif isinstance(value, (date, datetime)):
                value = value.isoformat()

            item[key] = value

        result.append(item)

    return result


def validate_recurring_data(data):
    txn_type = str(data.get("txn_type", data.get("type", ""))).upper()

    if txn_type not in ALLOWED_TYPES:
        raise ValueError("Type must be INCOME or EXPENSE.")

    amount = parse_amount(data.get("amount"))

    currency = str(data.get("currency_code", "INR")).strip().upper()

    if len(currency) != 3 or not currency.isalpha():
        raise ValueError("Currency code must contain three letters.")

    frequency = str(data.get("frequency", "")).strip().upper()

    if frequency not in ALLOWED_FREQUENCIES:
        raise ValueError(
            "Frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY."
        )

    start_date = parse_date(data.get("start_date", date.today().isoformat()))

    next_due_date = parse_date(
        data.get("next_due_date", start_date.isoformat())
    )

    category_id = data.get("category_id")

    try:
        category_id = int(category_id) if category_id not in (None, "") else None
    except (ValueError, TypeError):
        raise ValueError("Category ID must be a valid integer.")

    description = str(
        data.get("description", data.get("title", ""))
    ).strip()

    if not description:
        raise ValueError("Description is required.")

    if len(description) > 500:
        raise ValueError("Description cannot exceed 500 characters.")

    is_active = data.get("is_active", True)

    if not isinstance(is_active, bool):
        raise ValueError("is_active must be true or false.")

    return {
        "txn_type": txn_type,
        "amount": amount,
        "currency_code": currency,
        "frequency": frequency,
        "start_date": start_date,
        "next_due_date": next_due_date,
        "category_id": category_id,
        "description": description,
        "is_active": is_active,
    }


@recurring_bp.get("/api/recurring")
@login_required
def list_recurring():
    try:
        user_id = session["user_id"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        r.recurring_id,
                        r.category_id,
                        r.txn_type,
                        r.amount,
                        r.currency_code,
                        r.description,
                        r.frequency,
                        r.start_date,
                        r.next_due_date,
                        r.is_active,
                        c.name AS category_name
                    FROM public.recurring_transactions r
                    LEFT JOIN public.categories c
                        ON c.category_id = r.category_id
                    WHERE r.user_id = %s
                    ORDER BY r.next_due_date ASC, r.recurring_id DESC
                    """,
                    (user_id,),
                )

                items = serialize_rows(cur.fetchall())

        return jsonify({"items": items})

    except Exception:
        current_app.logger.exception("Recurring transactions retrieval failed")
        return api_error("Could not retrieve recurring transactions.", 500)


@recurring_bp.post("/api/recurring")
@login_required
def create_recurring():
    

    try:
        data = get_json()
        item = validate_recurring_data(data)

        with get_connection() as conn:
            with conn.cursor() as cur:
                if item["category_id"] is not None:
                    cur.execute(
                        """
                        SELECT category_id
                        FROM public.categories
                        WHERE category_id = %s
                        """,
                        (item["category_id"],),
                    )

                    if not cur.fetchone():
                        return api_error("Category not found.", 404)

                cur.execute(
                    """
                    INSERT INTO public.recurring_transactions
                        (
                            user_id, category_id, txn_type, amount,
                            currency_code, description, frequency,
                            start_date, next_due_date, is_active
                        )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING recurring_id
                    """,
                    (
                        session["user_id"],
                        item["category_id"],
                        item["txn_type"],
                        item["amount"],
                        item["currency_code"],
                        item["description"],
                        item["frequency"],
                        item["start_date"],
                        item["next_due_date"],
                        item["is_active"],
                    ),
                )

                recurring_id = cur.fetchone()["recurring_id"]

        return jsonify({
            "message": "Recurring transaction created.",
            "recurring_id": recurring_id,
        }), 201

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Recurring transaction creation failed")
        return api_error("Could not create recurring transaction.", 500)


@recurring_bp.put("/api/recurring/<int:recurring_id>")
@login_required
def update_recurring(recurring_id):
    
    try:
        data = get_json()
        item = validate_recurring_data(data)

        with get_connection() as conn:
            with conn.cursor() as cur:
                if item["category_id"] is not None:
                    cur.execute(
                        """
                        SELECT category_id
                        FROM public.categories
                        WHERE category_id = %s
                        """,
                        (item["category_id"],),
                    )

                    if not cur.fetchone():
                        return api_error("Category not found.", 404)

                cur.execute(
                    """
                    UPDATE public.recurring_transactions
                    SET category_id = %s,
                        txn_type = %s,
                        amount = %s,
                        currency_code = %s,
                        description = %s,
                        frequency = %s,
                        start_date = %s,
                        next_due_date = %s,
                        is_active = %s
                    WHERE recurring_id = %s AND user_id = %s
                    """,
                    (
                        item["category_id"],
                        item["txn_type"],
                        item["amount"],
                        item["currency_code"],
                        item["description"],
                        item["frequency"],
                        item["start_date"],
                        item["next_due_date"],
                        item["is_active"],
                        recurring_id,
                        session["user_id"],
                    ),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Recurring transaction not found.", 404)

        return jsonify({"message": "Recurring transaction updated."})

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Recurring transaction update failed")
        return api_error("Could not update recurring transaction.", 500)


@recurring_bp.delete("/api/recurring/<int:recurring_id>")
@login_required
def delete_recurring(recurring_id):
    

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM public.recurring_transactions
                    WHERE recurring_id = %s AND user_id = %s
                    """,
                    (recurring_id, session["user_id"]),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Recurring transaction not found.", 404)

        return jsonify({"message": "Recurring transaction deleted."})

    except Exception:
        current_app.logger.exception("Recurring transaction deletion failed")
        return api_error("Could not delete recurring transaction.", 500)

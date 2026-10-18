
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, session, current_app

from db import get_connection
from routes.auth import login_required, api_error, get_json


bills_bp = Blueprint("bills", __name__)


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
        raise ValueError("Date must use YYYY-MM-DD format.")


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


def validate_bill_data(data):
    name = str(data.get("name", "")).strip()

    if not name:
        raise ValueError("Bill name is required.")

    if len(name) > 150:
        raise ValueError("Bill name cannot exceed 150 characters.")

    amount = parse_amount(data.get("amount"))
    due_date = parse_date(data.get("due_date"))

    currency = str(data.get("currency_code", "INR")).strip().upper()

    if len(currency) != 3 or not currency.isalpha():
        raise ValueError("Currency code must contain three letters.")

    category = str(data.get("category", "")).strip()[:100]
    notes = str(data.get("notes", "")).strip()[:1000]

    recurrence = str(data.get("recurrence", "NONE")).strip().upper()

    allowed_recurrences = {
        "NONE", "WEEKLY", "MONTHLY", "YEARLY"
    }

    if recurrence not in allowed_recurrences:
        raise ValueError(
            "Recurrence must be NONE, WEEKLY, MONTHLY, or YEARLY."
        )

    status = str(data.get("status", "UNPAID")).strip().upper()

    if status not in ("UNPAID", "PAID"):
        raise ValueError("Status must be UNPAID or PAID.")

    return {
        "name": name,
        "amount": amount,
        "currency_code": currency,
        "due_date": due_date,
        "status": status,
        "category": category,
        "notes": notes,
        "recurrence": recurrence,
    }


@bills_bp.get("/api/bills")
@login_required
def list_bills():
    try:
        status = request.args.get("status", "").strip().upper()

        query = """
            SELECT bill_id, name, amount, currency_code, due_date,
                   status, category, notes, recurrence
            FROM public.bills
            WHERE user_id = %s
        """

        params = [session["user_id"]]

        if status:
            if status not in ("PAID", "UNPAID"):
                return api_error("Status must be PAID or UNPAID.")

            query += " AND status = %s"
            params.append(status)

        query += " ORDER BY due_date ASC, bill_id DESC"

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                bills = serialize_rows(cur.fetchall())

        return jsonify({"items": bills})

    except Exception:
        current_app.logger.exception("Bill retrieval failed")
        return api_error("Could not retrieve bills.", 500)


@bills_bp.post("/api/bills")
@login_required
def create_bill():
    

    try:
        data = get_json()
        bill = validate_bill_data(data)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.bills
                        (user_id, name, amount, currency_code, due_date,
                         status, category, notes, recurrence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING bill_id
                    """,
                    (
                        session["user_id"],
                        bill["name"],
                        bill["amount"],
                        bill["currency_code"],
                        bill["due_date"],
                        bill["status"],
                        bill["category"],
                        bill["notes"],
                        bill["recurrence"],
                    ),
                )

                bill_id = cur.fetchone()["bill_id"]

        return jsonify({
            "message": "Bill created successfully.",
            "bill_id": bill_id,
        }), 201

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Bill creation failed")
        return api_error("Could not create bill.", 500)


@bills_bp.put("/api/bills/<int:bill_id>")
@login_required
def update_bill(bill_id):
   

    try:
        data = get_json()
        bill = validate_bill_data(data)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.bills
                    SET name = %s,
                        amount = %s,
                        currency_code = %s,
                        due_date = %s,
                        status = %s,
                        category = %s,
                        notes = %s,
                        recurrence = %s
                    WHERE bill_id = %s AND user_id = %s
                    """,
                    (
                        bill["name"],
                        bill["amount"],
                        bill["currency_code"],
                        bill["due_date"],
                        bill["status"],
                        bill["category"],
                        bill["notes"],
                        bill["recurrence"],
                        bill_id,
                        session["user_id"],
                    ),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Bill not found.", 404)

        return jsonify({"message": "Bill updated successfully."})

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Bill update failed")
        return api_error("Could not update bill.", 500)


@bills_bp.delete("/api/bills/<int:bill_id>")
@login_required
def delete_bill(bill_id):
    

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM public.bills
                    WHERE bill_id = %s AND user_id = %s
                    """,
                    (bill_id, session["user_id"]),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Bill not found.", 404)

        return jsonify({"message": "Bill deleted successfully."})

    except Exception:
        current_app.logger.exception("Bill deletion failed")
        return api_error("Could not delete bill.", 500)


@bills_bp.patch("/api/bills/<int:bill_id>/paid")
@login_required
def mark_bill_paid(bill_id):
    
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.bills
                    SET status = 'PAID'
                    WHERE bill_id = %s AND user_id = %s
                    """,
                    (bill_id, session["user_id"]),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Bill not found.", 404)

        return jsonify({"message": "Bill marked as paid."})

    except Exception:
        current_app.logger.exception("Marking bill as paid failed")
        return api_error("Could not update bill status.", 500)

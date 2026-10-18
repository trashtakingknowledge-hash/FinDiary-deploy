
from flask import Blueprint, jsonify, request, session

from routes.auth import login_required
from routes.auth import api_error, get_json
from db import get_connection

from decimal import Decimal, InvalidOperation
from datetime import datetime, date


transactions_bp = Blueprint("transactions", __name__)


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
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError("Date must use YYYY-MM-DD format.")


def rows_to_dicts(rows):
    result = []

    for row in rows:
        item = {}
        for key, value in row.items():
            if isinstance(value, Decimal):
                value = float(value)
            elif isinstance(value, (datetime, date)):
                value = value.isoformat()
            item[key] = value
        result.append(item)

    return result


@transactions_bp.get("/api/transactions")
@login_required
def list_transactions():
    try:
        clauses = ["t.user_id = %s"]
        params = [session["user_id"]]

        txn_type = request.args.get("type", "").upper()
        category_id = request.args.get("category_id")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        search = request.args.get("search", "").strip()

        if txn_type in ("INCOME", "EXPENSE"):
            clauses.append("t.txn_type = %s")
            params.append(txn_type)

        if category_id:
            clauses.append("t.category_id = %s")
            params.append(int(category_id))

        if start_date:
            clauses.append("t.txn_date >= %s")
            params.append(parse_date(start_date))

        if end_date:
            clauses.append("t.txn_date < %s::date + INTERVAL '1 day'")
            params.append(end_date)

        if search:
            clauses.append("LOWER(COALESCE(t.description, '')) LIKE %s")
            params.append(f"%{search.lower()}%")

        page = max(1, int(request.args.get("page", "1")))
        page_size = min(100, max(1, int(request.args.get("page_size", "15"))))
        offset = (page - 1) * page_size
        where = " AND ".join(clauses)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT COUNT(*) AS total FROM public.transactions t WHERE {where}",
                    params,
                )
                total = cur.fetchone()["total"]

                cur.execute(
                    f"""
                    SELECT
                        t.transaction_id,
                        t.txn_type,
                        t.amount,
                        t.currency_code,
                        t.description,
                        t.txn_date,
                        t.category_id,
                        c.name AS category,
                        c.name AS category_name
                    FROM public.transactions t
                    LEFT JOIN public.categories c
                        ON c.category_id = t.category_id
                    WHERE {where}
                    ORDER BY t.txn_date DESC, t.transaction_id DESC
                    LIMIT %s OFFSET %s
                    """,
                    params + [page_size, offset],
                )
                items = rows_to_dicts(cur.fetchall())

        return jsonify({
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
        })

    except (ValueError, TypeError):
        return api_error("Invalid transaction filter or pagination value.")

    except Exception:
        transactions_bp.logger.exception("Transaction retrieval failed")
        return api_error("Could not retrieve transactions.", 500)


@transactions_bp.post("/api/transactions")
@login_required
def create_transaction():
    

    try:
        data = get_json()

        txn_type = str(data.get("txn_type", data.get("type", ""))).upper()
        if txn_type not in ("INCOME", "EXPENSE"):
            return api_error("Transaction type must be INCOME or EXPENSE.")

        amount = parse_amount(data.get("amount"))
        txn_date = parse_date(data.get("txn_date", data.get("date")))
        currency = str(data.get("currency_code", "INR")).upper()

        if len(currency) != 3:
            return api_error("Currency code must contain three letters.")

        category_id = data.get("category_id")
        category_id = int(category_id) if category_id not in (None, "") else None

        description = str(
            data.get("description", data.get("title", ""))
        ).strip()[:500]

        with get_connection() as conn:
            with conn.cursor() as cur:
                if category_id is not None:
                    cur.execute(
                        "SELECT category_id FROM public.categories WHERE category_id = %s",
                        (category_id,),
                    )
                    if not cur.fetchone():
                        return api_error("Category not found.", 404)

                cur.execute(
                    """
                    INSERT INTO public.transactions
                        (user_id, category_id, txn_type, amount,
                         currency_code, description, txn_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING transaction_id
                    """,
                    (
                        session["user_id"],
                        category_id,
                        txn_type,
                        amount,
                        currency,
                        description,
                        txn_date,
                    ),
                )
                new_id = cur.fetchone()["transaction_id"]

        return jsonify({
            "message": "Transaction created.",
            "transaction_id": new_id,
        }), 201

    except ValueError as exc:
        return api_error(str(exc))

    except Exception:
        transactions_bp.logger.exception("Transaction creation failed")
        return api_error("Could not create transaction.", 500)


@transactions_bp.put("/api/transactions/<int:transaction_id>")
@login_required
def update_transaction(transaction_id):
    

    try:
        data = get_json()

        txn_type = str(data.get("txn_type", data.get("type", ""))).upper()
        if txn_type not in ("INCOME", "EXPENSE"):
            return api_error("Transaction type must be INCOME or EXPENSE.")

        amount = parse_amount(data.get("amount"))
        txn_date = parse_date(data.get("txn_date", data.get("date")))
        currency = str(data.get("currency_code", "INR")).upper()

        if len(currency) != 3:
            return api_error("Currency code must contain three letters.")

        category_id = data.get("category_id")
        category_id = int(category_id) if category_id not in (None, "") else None
        description = str(
            data.get("description", data.get("title", ""))
        ).strip()[:500]

        with get_connection() as conn:
            with conn.cursor() as cur:
                if category_id is not None:
                    cur.execute(
                        "SELECT category_id FROM public.categories WHERE category_id = %s",
                        (category_id,),
                    )
                    if not cur.fetchone():
                        return api_error("Category not found.", 404)

                cur.execute(
                    """
                    UPDATE public.transactions
                    SET category_id = %s,
                        txn_type = %s,
                        amount = %s,
                        currency_code = %s,
                        description = %s,
                        txn_date = %s
                    WHERE transaction_id = %s AND user_id = %s
                    """,
                    (
                        category_id,
                        txn_type,
                        amount,
                        currency,
                        description,
                        txn_date,
                        transaction_id,
                        session["user_id"],
                    ),
                )
                changed = cur.rowcount

        if not changed:
            return api_error("Transaction not found.", 404)

        return jsonify({"message": "Transaction updated."})

    except ValueError as exc:
        return api_error(str(exc))

    except Exception:
        transactions_bp.logger.exception("Transaction update failed")
        return api_error("Could not update transaction.", 500)


@transactions_bp.delete("/api/transactions/<int:transaction_id>")
@login_required
def delete_transaction(transaction_id):
    

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM public.transactions
                    WHERE transaction_id = %s AND user_id = %s
                    """,
                    (transaction_id, session["user_id"]),
                )
                changed = cur.rowcount

        if not changed:
            return api_error("Transaction not found.", 404)

        return jsonify({"message": "Transaction deleted."})

    except Exception:
        transactions_bp.logger.exception("Transaction deletion failed")
        return api_error("Could not delete transaction.", 500)

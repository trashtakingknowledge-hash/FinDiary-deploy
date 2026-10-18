
from flask import Blueprint, jsonify, session

from db import get_connection
from routes.auth import login_required


overview_bp = Blueprint("overview", __name__)


def json_value(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "as_tuple"):  # Decimal
        return float(value)
    return value


def rows_to_dicts(rows):
    return [
        {key: json_value(value) for key, value in row.items()}
        for row in rows
    ]


@overview_bp.get("/api/categories")
@login_required
def categories():
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT category_id, name, kind, color
                    FROM public.categories
                    ORDER BY name
                    """
                )
                items = rows_to_dicts(cur.fetchall())

        return jsonify(items)

    except Exception:
        overview_bp.logger.exception("Category retrieval failed")
        return jsonify({"error": "Could not retrieve categories."}), 500


@overview_bp.get("/api/dashboard/summary")
@login_required
def dashboard_summary():
    try:
        user_id = session["user_id"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        COALESCE(
                            SUM(CASE WHEN txn_type = 'INCOME'
                                THEN amount ELSE 0 END), 0
                        ) AS income,
                        COALESCE(
                            SUM(CASE WHEN txn_type = 'EXPENSE'
                                THEN amount ELSE 0 END), 0
                        ) AS expenses
                    FROM public.transactions
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )

                row = cur.fetchone()
                income = float(row["income"])
                expenses = float(row["expenses"])

                cur.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM public.bills
                    WHERE user_id = %s
                      AND status = 'UNPAID'
                      AND due_date < CURRENT_DATE
                    """,
                    (user_id,),
                )
                overdue_bills = cur.fetchone()["count"]

                cur.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM public.bills
                    WHERE user_id = %s
                      AND status = 'UNPAID'
                      AND due_date >= CURRENT_DATE
                      AND due_date < CURRENT_DATE + 4
                    """,
                    (user_id,),
                )
                upcoming_bills = cur.fetchone()["count"]

        return jsonify({
            "income": income,
            "expenses": expenses,
            "net_balance": income - expenses,
            "overdue_bills": overdue_bills,
            "upcoming_bills_next_3_days": upcoming_bills,
        })

    except Exception:
        overview_bp.logger.exception("Dashboard summary failed")
        return jsonify({
            "error": "Could not calculate dashboard summary."
        }), 500

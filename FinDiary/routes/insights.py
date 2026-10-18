
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request, session, current_app

from db import get_connection
from routes.auth import login_required, api_error


insights_bp = Blueprint("insights", __name__)


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


@insights_bp.get("/api/insights/summary")
@login_required
def insights_summary():
    """Return overall income, expenses, and savings rate."""

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
                        ) AS total_income,
                        COALESCE(
                            SUM(CASE WHEN txn_type = 'EXPENSE'
                                THEN amount ELSE 0 END), 0
                        ) AS total_expenses,
                        COUNT(*) AS transaction_count
                    FROM public.transactions
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )

                row = cur.fetchone()

        income = float(row["total_income"])
        expenses = float(row["total_expenses"])
        net_savings = income - expenses

        savings_rate = (
            round((net_savings / income) * 100, 2)
            if income > 0 else 0
        )

        return jsonify({
            "total_income": income,
            "total_expenses": expenses,
            "net_savings": net_savings,
            "savings_rate": savings_rate,
            "transaction_count": row["transaction_count"],
        })

    except Exception:
        current_app.logger.exception("Insights summary failed")
        return api_error("Could not calculate financial insights.", 500)


@insights_bp.get("/api/insights/monthly")
@login_required
def monthly_insights():
    """Return monthly income and expenses for a selected period."""

    try:
        months = int(request.args.get("months", "6"))

        if not 1 <= months <= 24:
            return api_error("Months must be between 1 and 24.")

        user_id = session["user_id"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        TO_CHAR(
                            DATE_TRUNC('month', txn_date),
                            'YYYY-MM'
                        ) AS month,
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
                      AND txn_date >= (
                          DATE_TRUNC('month', CURRENT_DATE)
                          - (%s - 1) * INTERVAL '1 month'
                      )
                    GROUP BY DATE_TRUNC('month', txn_date)
                    ORDER BY DATE_TRUNC('month', txn_date)
                    """,
                    (user_id, months),
                )

                items = serialize_rows(cur.fetchall())

        for item in items:
            item["net"] = item["income"] - item["expenses"]

        return jsonify({"items": items})

    except (ValueError, TypeError):
        return api_error("Months must be a valid integer.")
    except Exception:
        current_app.logger.exception("Monthly insights failed")
        return api_error("Could not retrieve monthly insights.", 500)


@insights_bp.get("/api/insights/categories")
@login_required
def category_insights():
    """Return expense totals grouped by category."""

    try:
        user_id = session["user_id"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        COALESCE(c.name, 'Uncategorized') AS category,
                        COALESCE(SUM(t.amount), 0) AS total,
                        COUNT(*) AS transaction_count
                    FROM public.transactions t
                    LEFT JOIN public.categories c
                        ON c.category_id = t.category_id
                    WHERE t.user_id = %s
                      AND t.txn_type = 'EXPENSE'
                    GROUP BY COALESCE(c.name, 'Uncategorized')
                    ORDER BY total DESC
                    """,
                    (user_id,),
                )

                items = serialize_rows(cur.fetchall())

        grand_total = sum(item["total"] for item in items)

        for item in items:
            item["percentage"] = (
                round(item["total"] / grand_total * 100, 2)
                if grand_total > 0 else 0
            )

        return jsonify({"items": items})

    except Exception:
        current_app.logger.exception("Category insights failed")
        return api_error("Could not retrieve category insights.", 500)


@insights_bp.get("/api/insights/recent")
@login_required
def recent_insights():
    """Return the most recent transactions for the insights page."""

    try:
        limit = int(request.args.get("limit", "10"))

        if not 1 <= limit <= 50:
            return api_error("Limit must be between 1 and 50.")

        user_id = session["user_id"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        t.transaction_id,
                        t.txn_type,
                        t.amount,
                        t.currency_code,
                        t.description,
                        t.txn_date,
                        c.name AS category
                    FROM public.transactions t
                    LEFT JOIN public.categories c
                        ON c.category_id = t.category_id
                    WHERE t.user_id = %s
                    ORDER BY t.txn_date DESC, t.transaction_id DESC
                    LIMIT %s
                    """,
                    (user_id, limit),
                )

                items = serialize_rows(cur.fetchall())

        return jsonify({"items": items})

    except (ValueError, TypeError):
        return api_error("Limit must be a valid integer.")
    except Exception:
        current_app.logger.exception("Recent insights failed")
        return api_error("Could not retrieve recent transactions.", 500)

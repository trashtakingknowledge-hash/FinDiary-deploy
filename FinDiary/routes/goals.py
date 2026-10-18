
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, session, current_app

from db import get_connection
from routes.auth import login_required, api_error, get_json


goals_bp = Blueprint("goals", __name__)


def parse_amount(value, field_name="Amount", allow_zero=False):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field_name} must be a valid number.")

    minimum_invalid = amount < 0 if allow_zero else amount <= 0

    if not amount.is_finite() or minimum_invalid:
        if allow_zero:
            raise ValueError(f"{field_name} cannot be negative.")
        raise ValueError(f"{field_name} must be greater than zero.")

    return amount


def parse_date(value):
    if value in (None, ""):
        return None

    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError("Target date must use YYYY-MM-DD format.")


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


def validate_goal_data(data):
    name = str(data.get("name", "")).strip()

    if not name:
        raise ValueError("Goal name is required.")

    if len(name) > 150:
        raise ValueError("Goal name cannot exceed 150 characters.")

    target_amount = parse_amount(
        data.get("target_amount"),
        "Target amount",
    )

    saved_amount = parse_amount(
        data.get("saved_amount", 0),
        "Saved amount",
        allow_zero=True,
    )

    if saved_amount > target_amount:
        raise ValueError("Saved amount cannot exceed the target amount.")

    currency = str(data.get("currency_code", "INR")).strip().upper()

    if len(currency) != 3 or not currency.isalpha():
        raise ValueError("Currency code must contain three letters.")

    target_date = parse_date(
        data.get("target_date", data.get("deadline"))
    )

    color = str(data.get("color", "#6366f1")).strip()

    if len(color) > 30:
        raise ValueError("Goal color is invalid.")

    description = str(data.get("description", "")).strip()

    if len(description) > 1000:
        raise ValueError("Description cannot exceed 1000 characters.")

    return {
        "name": name,
        "target_amount": target_amount,
        "saved_amount": saved_amount,
        "currency_code": currency,
        "deadline": target_date,
        "color": color,
        "description": description,
    }


@goals_bp.get("/api/goals")
@login_required
def list_goals():
    try:
        user_id = session["user_id"]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        goal_id,
                        name,
                        target_amount,
                        saved_amount,
                        currency_code,
                        deadline,
                        color
                    FROM public.goals
                    WHERE user_id = %s
                    ORDER BY deadline ASC NULLS LAST, goal_id DESC
                    """,
                    (user_id,),
                )

                items = serialize_rows(cur.fetchall())

        for item in items:
            target = item["target_amount"]
            saved = item["saved_amount"]

            item["target_date"] = item["deadline"]
            item["progress_percentage"] = (
                round(saved / target * 100, 2)
                if target > 0 else 0
            )
            item["remaining_amount"] = max(target - saved, 0)
            item["status"] = (
                "COMPLETED" if saved >= target else "IN_PROGRESS"
            )

        return jsonify({"items": items})

    except Exception:
        current_app.logger.exception("Goal retrieval failed")
        return api_error("Could not retrieve goals.", 500)


@goals_bp.post("/api/goals")
@login_required
def create_goal():
    

    try:
        data = get_json()
        goal = validate_goal_data(data)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.goals
                        (
                            user_id, name, target_amount, saved_amount,
                            currency_code, deadline, color
                        )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING goal_id
                    """,
                    (
                        session["user_id"],
                        goal["name"],
                        goal["target_amount"],
                        goal["saved_amount"],
                        goal["currency_code"],
                        goal["deadline"],
                        goal["color"],
                    ),
                )

                goal_id = cur.fetchone()["goal_id"]

        return jsonify({
            "message": "Goal created successfully.",
            "goal_id": goal_id,
        }), 201

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Goal creation failed")
        return api_error("Could not create goal.", 500)


@goals_bp.put("/api/goals/<int:goal_id>")
@login_required
def update_goal(goal_id):
    

    try:
        data = get_json()
        goal = validate_goal_data(data)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.goals
                    SET name = %s,
                        target_amount = %s,
                        saved_amount = %s,
                        currency_code = %s,
                        deadline = %s,
                        color = %s
                    WHERE goal_id = %s AND user_id = %s
                    """,
                    (
                        goal["name"],
                        goal["target_amount"],
                        goal["saved_amount"],
                        goal["currency_code"],
                        goal["deadline"],
                        goal["color"],
                        goal_id,
                        session["user_id"],
                    ),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Goal not found.", 404)

        return jsonify({"message": "Goal updated successfully."})

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Goal update failed")
        return api_error("Could not update goal.", 500)


@goals_bp.delete("/api/goals/<int:goal_id>")
@login_required
def delete_goal(goal_id):
    

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM public.goals
                    WHERE goal_id = %s AND user_id = %s
                    """,
                    (goal_id, session["user_id"]),
                )

                changed = cur.rowcount

        if not changed:
            return api_error("Goal not found.", 404)

        return jsonify({"message": "Goal deleted successfully."})

    except Exception:
        current_app.logger.exception("Goal deletion failed")
        return api_error("Could not delete goal.", 500)


@goals_bp.post("/api/goals/<int:goal_id>/contributions")
@login_required
def add_goal_contribution(goal_id):
    

    try:
        data = get_json()

        amount = parse_amount(data.get("amount"), "Contribution")

        note = str(data.get("note", "")).strip()

        if len(note) > 500:
            return api_error("Contribution note cannot exceed 500 characters.")

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT goal_id, target_amount, saved_amount
                    FROM public.goals
                    WHERE goal_id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (goal_id, session["user_id"]),
                )

                goal = cur.fetchone()

                if not goal:
                    return api_error("Goal not found.", 404)

                new_saved_amount = (
                    Decimal(str(goal["saved_amount"])) + amount
                )

                if new_saved_amount > Decimal(str(goal["target_amount"])):
                    return api_error(
                        "Contribution exceeds the remaining goal amount."
                    )

                cur.execute(
                    """
                    INSERT INTO public.goal_contributions
                        (goal_id, amount, note)
                    VALUES (%s, %s, %s)
                    """,
                    (goal_id, amount, note),
                )

                cur.execute(
                    """
                    UPDATE public.goals
                    SET saved_amount = %s
                    WHERE goal_id = %s AND user_id = %s
                    """,
                    (
                        new_saved_amount,
                        goal_id,
                        session["user_id"],
                    ),
                )

        return jsonify({
            "message": "Contribution added successfully.",
            "saved_amount": float(new_saved_amount),
            "remaining_amount": float(
                Decimal(str(goal["target_amount"])) - new_saved_amount
            ),
        }), 201

    except ValueError as exc:
        return api_error(str(exc))
    except Exception:
        current_app.logger.exception("Goal contribution failed")
        return api_error("Could not add goal contribution.", 500)

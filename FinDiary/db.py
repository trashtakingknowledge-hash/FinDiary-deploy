
# import os
# import psycopg


import os

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing. Check your .env file."
    )


def get_connection():
    """
    Create a PostgreSQL connection to Supabase.

    Use this with a context manager:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
    """
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        connect_timeout=10,
    )
# from dotenv import load_dotenv

# load_dotenv()


# def get_connection():
#     database_url = os.getenv("DATABASE_URL")

#     if not database_url:
#         raise RuntimeError(
#             "Set DATABASE_URL in your .env file."
#         )

#     return psycopg.connect(database_url)

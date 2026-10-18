# Zorvyn Personal Finance Dashboard — HTML/CSS/Vanilla JS + Flask + Oracle 11g

This project adapts the original Zorvyn dashboard into a traditional frontend served by Flask. It retains the original dark sidebar, indigo/purple accents, dashboard cards, chart/heatmap, bills, savings goals, transactions, and responsive layout. It does not require Next.js, React, TypeScript, Tailwind, or Node to run.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript
- Charts: Chart.js (loaded from CDN)
- Backend: Python Flask REST endpoints
- Database: Oracle Database 11g
- SQL tool: Oracle SQL Developer

## Run it
1. In Oracle SQL Developer, connect using your normal Oracle account. Create a dedicated application schema user using the SQL in `README.md` from the original starter instructions below, then connect as that user and run `schema.sql` with F5.
2. Create a Python virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and set the real Oracle host, port, service name or SID, username and password. Do not share the `.env` file.
4. If required by your Oracle 11g installation, install a compatible Oracle Instant Client and set `ORACLE_CLIENT_LIB_DIR` in `.env`. Oracle 11g may not work with python-oracledb Thin mode; follow the driver/client compatibility guidance for your machine.
5. Run `python app.py` and open `http://127.0.0.1:5000`.
6. Check `http://127.0.0.1:5000/api/health`.

## Create the database account
Run as a DBA account in SQL Developer, changing the password as appropriate:
```sql
CREATE USER finance_app IDENTIFIED BY "Choose_A_Strong_Password";
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER, CREATE PROCEDURE TO finance_app;
ALTER USER finance_app QUOTA UNLIMITED ON USERS;
```
Do not use SYS or SYSTEM as the application's runtime user. Connect as `FINANCE_APP`, open `schema.sql`, and run as a script (F5).

## Admin role
Register an account. New accounts are Viewer by default. To grant Admin privileges, an authorized DBA can run:
```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your-email@example.com';
COMMIT;
```
Log out and back in.

## Current implementation scope
The current backend supports registration/login/logout, health check, dashboard totals, transaction create/list/delete, categories, bill create/list/mark-paid, and goal create/list/contributions. The converted frontend displays the main Zorvyn dashboard and uses those APIs. Recurring transaction scheduling, notifications, full edit/update forms, and full production hardening are still future work. The recurring page is explicitly marked as a next module rather than pretending the API exists.

## Security checklist before deployment
Set a long random `FLASK_SECRET_KEY`, keep `.env` private, enable HTTPS and secure cookies, add CSRF protection and rate limiting, and review authorization rules. This is a development starter, not production-ready financial software.

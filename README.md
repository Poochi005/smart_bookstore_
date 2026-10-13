# Smart Bookstore Management System

Two versions live in this repository:

| Version | Where | Runs on | Data |
|---|---|---|---|
| **Flask + SQLite (full app)** | `app.py`, `templates/`, `static/` | your PC, PythonAnywhere, Render, Railway | real database (`bookstore.db`) |
| **Static demo for GitHub Pages** | `docs/` | GitHub Pages | saved in each visitor's browser (localStorage) only |

GitHub Pages can only host static files, so it cannot run `app.py`.
The `docs/` version has the same pages and validation rules, but its data is
**not shared between devices or users** and is lost if browser data is cleared.

## Run the Flask app
    python -m venv venv
    venv\Scripts\activate        (Windows)   |   source venv/bin/activate  (macOS/Linux)
    pip install -r requirements.txt
    python app.py
Open http://127.0.0.1:5000  (`bookstore.db` is created on first run with 3 sample books)

Production: `gunicorn app:app` with environment variable `SECRET_KEY` set.
Debug mode is off unless `FLASK_DEBUG=1`.

## GitHub Pages
Settings -> Pages -> Source: *Deploy from a branch* -> Branch `main`, folder `/docs`.
Site: https://poochi005.github.io/smart_bookstore/

## Structure
    app.py, requirements.txt, database.sql
    templates/  base, index, add_book (add + edit), sell, sales, contact
    static/style.css
    docs/       index.html, app.js, style.css, .nojekyll   (GitHub Pages site)

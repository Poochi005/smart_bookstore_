import math
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from flask import Flask, flash, redirect, render_template, request, url_for

app = Flask(__name__)
# Set SECRET_KEY in the hosting environment for production.
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-me")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bookstore.db"


def parse_book_form(form):
    """Validate title/author/category/price/stock. Returns (values, error)."""
    values = {
        "title": form.get("title", "").strip(),
        "author": form.get("author", "").strip(),
        "category": form.get("category", "").strip() or "General",
        "price": form.get("price", "").strip(),
        "stock": form.get("stock", "").strip(),
    }
    try:
        price = float(values["price"])
        stock = int(values["stock"])
    except ValueError:
        return values, "Price and stock must be valid numbers."
    if not values["title"] or not values["author"]:
        return values, "Title and author are required."
    if not math.isfinite(price) or price <= 0:
        return values, "Price must be greater than 0."
    if stock < 0:
        return values, "Stock cannot be negative."
    values["price"], values["stock"] = price, stock
    return values, None


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                category TEXT DEFAULT 'General'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                total REAL NOT NULL,
                sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id)
            )
        """)
        count = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO books (title, author, price, stock, category) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    ("The Alchemist", "Paulo Coelho", 350, 10, "Fiction"),
                    ("Atomic Habits", "James Clear", 499, 15, "Self Help"),
                    ("Rich Dad Poor Dad", "Robert Kiyosaki", 399, 8, "Finance"),
                ],
            )
        conn.commit()


# Create tables on import so `flask run` / gunicorn work too,
# not only `python app.py`.
init_db()


@app.route("/")
def home():
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    sql = "SELECT * FROM books WHERE 1=1"
    params = []
    if q:
        sql += " AND (title LIKE ? OR author LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY id DESC"
    with closing(get_db()) as conn:
        books = conn.execute(sql, params).fetchall()
        categories = [
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT category FROM books ORDER BY category"
            ).fetchall()
        ]
        total_books = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        total_stock = conn.execute(
            "SELECT COALESCE(SUM(stock), 0) FROM books"
        ).fetchone()[0]
        total_sales = conn.execute(
            "SELECT COALESCE(SUM(total), 0) FROM sales"
        ).fetchone()[0]
    return render_template(
        "index.html",
        books=books,
        categories=categories,
        q=q,
        category=category,
        total_books=total_books,
        total_stock=total_stock,
        total_sales=total_sales,
    )


@app.route("/add-book", methods=["GET", "POST"])
def add_book():
    form = {"title": "", "author": "", "category": "General", "price": "", "stock": ""}

    if request.method == "POST":
        values, error = parse_book_form(request.form)
        if error:
            flash(error, "error")
            return render_template("add_book.html", form=values, editing=False)

        with closing(get_db()) as conn:
            conn.execute(
                "INSERT INTO books (title, author, price, stock, category) "
                "VALUES (?, ?, ?, ?, ?)",
                (values["title"], values["author"], values["price"],
                 values["stock"], values["category"]),
            )
            conn.commit()
        flash("Book added successfully.", "success")
        return redirect(url_for("home"))

    return render_template("add_book.html", form=form, editing=False)


@app.route("/edit-book/<int:book_id>", methods=["GET", "POST"])
def edit_book(book_id):
    with closing(get_db()) as conn:
        book = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        if not book:
            flash("Book not found.", "error")
            return redirect(url_for("home"))

        if request.method == "POST":
            values, error = parse_book_form(request.form)
            if error:
                flash(error, "error")
                return render_template(
                    "add_book.html", form=values, editing=True, book_id=book_id
                )
            conn.execute(
                "UPDATE books SET title = ?, author = ?, price = ?, stock = ?, "
                "category = ? WHERE id = ?",
                (values["title"], values["author"], values["price"],
                 values["stock"], values["category"], book_id),
            )
            conn.commit()
            flash("Book updated successfully.", "success")
            return redirect(url_for("home"))

    form = {k: book[k] for k in ("title", "author", "category", "price", "stock")}
    return render_template("add_book.html", form=form, editing=True, book_id=book_id)


@app.post("/delete-book/<int:book_id>")
def delete_book(book_id):
    with closing(get_db()) as conn:
        cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        conn.commit()
    if cur.rowcount:
        flash("Book deleted successfully.", "success")
    else:
        flash("Book not found.", "error")
    return redirect(url_for("home"))


@app.route("/sell/<int:book_id>", methods=["GET", "POST"])
def sell_book(book_id):
    with closing(get_db()) as conn:
        book = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()

        if not book:
            flash("Book not found.", "error")
            return redirect(url_for("home"))

        if request.method == "POST":
            try:
                quantity = int(request.form.get("quantity", 0))
            except ValueError:
                quantity = 0

            if quantity <= 0 or quantity > book["stock"]:
                flash("Enter a quantity within the available stock.", "error")
                return render_template("sell.html", book=book)

            # Atomic stock update: only succeeds if enough stock is still left.
            cur = conn.execute(
                "UPDATE books SET stock = stock - ? WHERE id = ? AND stock >= ?",
                (quantity, book_id, quantity),
            )
            if cur.rowcount == 0:
                conn.rollback()
                flash("Enter a quantity within the available stock.", "error")
                book = conn.execute(
                    "SELECT * FROM books WHERE id = ?", (book_id,)
                ).fetchone()
                return render_template("sell.html", book=book)

            total = round(quantity * book["price"], 2)
            conn.execute(
                "INSERT INTO sales (book_id, quantity, total) VALUES (?, ?, ?)",
                (book_id, quantity, total),
            )
            conn.commit()
            flash(f"Sale recorded. Total: ₹{total:.2f}", "success")
            return redirect(url_for("sales"))

    return render_template("sell.html", book=book)


@app.route("/sales")
def sales():
    with closing(get_db()) as conn:
        # LEFT JOIN so sales stay visible even if the book was deleted later.
        rows = conn.execute("""
            SELECT sales.id,
                   COALESCE(books.title, '(Deleted book)') AS title,
                   sales.quantity, sales.total, sales.sale_date
            FROM sales
            LEFT JOIN books ON books.id = sales.book_id
            ORDER BY sales.id DESC
        """).fetchall()
    return render_template("sales.html", sales=rows)


@app.route("/contact", methods=["GET", "POST"])
def contact():
    form = {"name": "", "email": "", "message": ""}
    if request.method == "POST":
        form = {k: request.form.get(k, "").strip() for k in form}
        email_ok = (
            "@" in form["email"]
            and "." in form["email"].split("@")[-1]
            and " " not in form["email"]
        )
        if not form["name"]:
            flash("Please enter your name.", "error")
        elif not email_ok:
            flash("Please enter a valid email address.", "error")
        elif len(form["message"]) < 10:
            flash("Message must be at least 10 characters.", "error")
        else:
            # NOTE: messages are validated but not stored or e-mailed.
            flash("Thank you! Your message has been received.", "success")
            return redirect(url_for("contact"))
    return render_template("contact.html", form=form)


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1")

/* Smart Bookstore – static (GitHub Pages) version.
   Data is kept in this browser's localStorage: it is NOT shared between
   devices/users and is lost if the browser data is cleared. The Flask +
   SQLite app in the repository root is the real multi-user version. */
(function () {
  "use strict";
  var KEY = "smartBookstore.v1";
  var memory = null; // fallback when localStorage is blocked

  function seed() {
    return {
      nextBookId: 4, nextSaleId: 1,
      books: [
        { id: 1, title: "The Alchemist", author: "Paulo Coelho", price: 350, stock: 10, category: "Fiction" },
        { id: 2, title: "Atomic Habits", author: "James Clear", price: 499, stock: 15, category: "Self Help" },
        { id: 3, title: "Rich Dad Poor Dad", author: "Robert Kiyosaki", price: 399, stock: 8, category: "Finance" }
      ],
      sales: []
    };
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.books) && Array.isArray(d.sales)) return d;
      }
    } catch (e) { /* storage blocked or corrupted: fall back below */ }
    if (!memory) { memory = seed(); save(memory); }
    return memory;
  }
  function save(d) {
    memory = d;
    try { window.localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage blocked: memory only */ }
  }
  function db() { return load(); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "₹" + Number(n).toFixed(2); }

  var pending = null; // flash message shown on next render
  function flash(msg, type) { pending = { msg: msg, type: type }; }
  function showFlash() {
    var el = document.getElementById("flash");
    el.innerHTML = pending ? '<div class="flash ' + pending.type + '">' + esc(pending.msg) + "</div>" : "";
    pending = null;
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  /* ---------- validation (same rules as Flask app.py) ---------- */
  function parseBook(f) {
    var v = {
      title: (f.title || "").trim(), author: (f.author || "").trim(),
      category: (f.category || "").trim() || "General",
      price: (f.price || "").trim(), stock: (f.stock || "").trim()
    };
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(v.price) || !/^[+-]?\d+$/.test(v.stock)) return { v: v, error: "Price and stock must be valid numbers." };
    var price = parseFloat(v.price), stock = parseInt(v.stock, 10);
    if (!v.title || !v.author) return { v: v, error: "Title and author are required." };
    if (!isFinite(price) || price <= 0) return { v: v, error: "Price must be greater than 0." };
    if (stock < 0) return { v: v, error: "Stock cannot be negative." };
    v.price = price; v.stock = stock;
    return { v: v, error: null };
  }

  /* ---------- views ---------- */
  function viewHome(query) {
    var d = db(), q = (query.q || "").trim(), cat = (query.category || "").trim();
    var totalStock = d.books.reduce(function (a, b) { return a + b.stock; }, 0);
    var totalSales = d.sales.reduce(function (a, s) { return a + s.total; }, 0);
    var cats = []; d.books.forEach(function (b) { if (cats.indexOf(b.category) < 0) cats.push(b.category); }); cats.sort();
    var list = d.books.filter(function (b) {
      var okQ = !q || b.title.toLowerCase().indexOf(q.toLowerCase()) >= 0 || b.author.toLowerCase().indexOf(q.toLowerCase()) >= 0;
      return okQ && (!cat || b.category === cat);
    }).sort(function (a, b) { return b.id - a.id; });

    var rows = list.map(function (b) {
      return "<tr><td><strong>" + esc(b.title) + "</strong></td><td>" + esc(b.author) + "</td><td>" + esc(b.category) +
        "</td><td>" + money(b.price) + "</td><td>" + b.stock + '</td><td class="actions">' +
        (b.stock > 0 ? '<a class="small-button" href="#/sell/' + b.id + '">Sell</a>' : '<span class="out-of-stock">Out of stock</span>') +
        '<a class="small-button secondary-btn" href="#/edit/' + b.id + '">Edit</a>' +
        '<button class="danger small-button" type="button" data-delete="' + b.id + '">Delete</button></td></tr>';
    }).join("");
    var opts = cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");
    return '<section class="intro"><h2>Welcome to Smart Bookstore</h2><p>Manage your books, track stock, record sales, and explore your inventory.</p></section>' +
      '<section class="stats"><div><strong>' + d.books.length + "</strong><span>Books</span></div><div><strong>" + totalStock +
      "</strong><span>Total Stock</span></div><div><strong>" + money(totalSales) + "</strong><span>Total Sales</span></div></section>" +
      '<section class="book-list" id="books"><div class="section-heading"><h2>Available Books</h2><a class="button" href="#/add">+ Add Book</a></div>' +
      '<form class="filters" id="filterForm"><input type="search" name="q" value="' + esc(q) + '" placeholder="Search by title or author">' +
      '<select name="category" aria-label="Category"><option value="">All categories</option>' + opts + "</select>" +
      '<button type="submit">Search</button>' + (q || cat ? '<a class="button secondary" href="#/books">Clear</a>' : "") + "</form>" +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : "<p>" + (q || cat ? "No books match your search." : "No books available.") + "</p>") + "</section>";
  }

  function viewBookForm(editing, id, f) {
    var form = f || { title: "", author: "", category: "General", price: "", stock: "" };
    return '<section class="add-book"><h2>' + (editing ? "Edit Book" : "Add a New Book") + '</h2><form id="bookForm" novalidate data-id="' + (id || "") + '">' +
      '<label for="title">Title:</label><input type="text" id="title" name="title" value="' + esc(form.title) + '" required>' +
      '<label for="author">Author:</label><input type="text" id="author" name="author" value="' + esc(form.author) + '" required>' +
      '<label for="category">Category:</label><input type="text" id="category" name="category" value="' + esc(form.category) + '">' +
      '<label for="price">Price:</label><input type="number" id="price" name="price" min="0.01" step="0.01" value="' + esc(form.price) + '" required>' +
      '<label for="stock">Stock:</label><input type="number" id="stock" name="stock" min="0" step="1" value="' + esc(form.stock) + '" required>' +
      '<div class="form-actions"><button type="submit">' + (editing ? "Save Changes" : "Add Book") + '</button><a class="button secondary" href="#/books">Cancel</a></div></form></section>';
  }

  function viewSell(id) {
    var b = db().books.filter(function (x) { return x.id === id; })[0];
    if (!b) { flash("Book not found.", "error"); go("#/books"); return null; }
    return '<section><h2>Record Book Sale</h2><p><strong>' + esc(b.title) + "</strong> by " + esc(b.author) + "</p><p>Price: " + money(b.price) +
      " | Available stock: " + b.stock + '</p><form id="sellForm" novalidate data-id="' + b.id + '"><label for="quantity">Quantity:</label>' +
      '<input type="number" id="quantity" name="quantity" min="1" max="' + b.stock + '" required>' +
      '<div class="form-actions"><button type="submit">Complete Sale</button><a class="button secondary" href="#/books">Cancel</a></div></form></section>';
  }

  function viewSales() {
    var d = db();
    var rows = d.sales.slice().sort(function (a, b) { return b.id - a.id; }).map(function (s) {
      var bk = d.books.filter(function (x) { return x.id === s.bookId; })[0];
      return "<tr><td>" + s.id + "</td><td>" + esc(bk ? bk.title : "(Deleted book)") + "</td><td>" + s.quantity + "</td><td>" + money(s.total) + "</td><td>" + esc(new Date(s.date).toLocaleString()) + "</td></tr>";
    }).join("");
    return "<section><h2>Sales History</h2>" + (rows ? '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Book</th><th>Quantity</th><th>Total</th><th>Date</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : "<p>No sales recorded yet.</p>") + "</section>";
  }

  function viewContact(f) {
    var form = f || { name: "", email: "", message: "" };
    return '<section><h2>Contact</h2><p>Smart Bookstore Management System. Built with HTML, CSS, Python, Flask and SQLite.</p><form id="contactForm" novalidate>' +
      '<label for="name">Name:</label><input type="text" id="name" name="name" value="' + esc(form.name) + '" required>' +
      '<label for="email">Email:</label><input type="email" id="email" name="email" value="' + esc(form.email) + '" required>' +
      '<label for="message">Message:</label><textarea id="message" name="message" rows="5" required>' + esc(form.message) + "</textarea>" +
      '<button type="submit">Send Message</button></form></section>';
  }

  /* ---------- router ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qs = {}, i = h.indexOf("?");
    if (i >= 0) { h.slice(i + 1).split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) qs[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " ")); }); h = h.slice(0, i); }
    return { path: h, query: qs };
  }
  var formState = null; // keeps typed values after a validation error

  function render() {
    var r = parseHash(), p = r.path.split("/").filter(Boolean), html = "", m;
    var view = document.getElementById("view");
    if (!p.length || p[0] === "books") html = viewHome(r.query);
    else if (p[0] === "add") html = viewBookForm(false, null, formState);
    else if (p[0] === "edit") {
      var id = parseInt(p[1], 10), b = db().books.filter(function (x) { return x.id === id; })[0];
      if (!b) { flash("Book not found.", "error"); go("#/books"); return; }
      html = viewBookForm(true, id, formState || { title: b.title, author: b.author, category: b.category, price: b.price, stock: b.stock });
    } else if (p[0] === "sell") { html = viewSell(parseInt(p[1], 10)); if (html === null) return; }
    else if (p[0] === "sales") html = viewSales();
    else if (p[0] === "contact") html = viewContact(formState);
    else { html = '<section><h2>Page not found</h2><p><a href="#/">Back to home</a></p></section>'; }
    formState = null;
    view.innerHTML = html;
    showFlash();
    if (p[0] === "books") { var el = document.getElementById("books"); if (el) el.scrollIntoView(); }
    document.title = "Smart Bookstore";
  }

  function formData(form) { var o = {}; Array.prototype.forEach.call(form.elements, function (e) { if (e.name) o[e.name] = e.value; }); return o; }

  document.addEventListener("submit", function (e) {
    var f = e.target; e.preventDefault();
    var d, data = formData(f);
    if (f.id === "filterForm") {
      var qs = []; if (data.q.trim()) qs.push("q=" + encodeURIComponent(data.q.trim())); if (data.category) qs.push("category=" + encodeURIComponent(data.category));
      go("#/books" + (qs.length ? "?" + qs.join("&") : "")); return;
    }
    if (f.id === "bookForm") {
      var res = parseBook(data), id = parseInt(f.getAttribute("data-id"), 10);
      if (res.error) { flash(res.error, "error"); formState = data; render(); return; }
      d = db();
      if (id) {
        var b = d.books.filter(function (x) { return x.id === id; })[0];
        if (!b) { flash("Book not found.", "error"); go("#/books"); return; }
        b.title = res.v.title; b.author = res.v.author; b.category = res.v.category; b.price = res.v.price; b.stock = res.v.stock;
        flash("Book updated successfully.", "success");
      } else {
        d.books.push({ id: d.nextBookId++, title: res.v.title, author: res.v.author, price: res.v.price, stock: res.v.stock, category: res.v.category });
        flash("Book added successfully.", "success");
      }
      save(d); go("#/books"); return;
    }
    if (f.id === "sellForm") {
      d = db(); var bid = parseInt(f.getAttribute("data-id"), 10);
      var book = d.books.filter(function (x) { return x.id === bid; })[0];
      if (!book) { flash("Book not found.", "error"); go("#/books"); return; }
      var qRaw = (data.quantity || "").trim(), qty = /^[+-]?\d+$/.test(qRaw) ? parseInt(qRaw, 10) : 0;
      if (qty <= 0 || qty > book.stock) { flash("Enter a quantity within the available stock.", "error"); render(); return; }
      book.stock -= qty;
      var total = Math.round(qty * book.price * 100) / 100;
      d.sales.push({ id: d.nextSaleId++, bookId: bid, quantity: qty, total: total, date: new Date().toISOString() });
      save(d); flash("Sale recorded. Total: " + money(total), "success"); go("#/sales"); return;
    }
    if (f.id === "contactForm") {
      var name = data.name.trim(), email = data.email.trim(), msg = data.message.trim();
      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), err = null;
      if (!name) err = "Please enter your name.";
      else if (!emailOk) err = "Please enter a valid email address.";
      else if (msg.length < 10) err = "Message must be at least 10 characters.";
      if (err) { flash(err, "error"); formState = { name: name, email: email, message: msg }; render(); return; }
      flash("Thank you! Your message has been received.", "success"); go("#/contact"); // not stored or sent anywhere
    }
  });

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-delete]") : null;
    if (!t) return;
    if (!window.confirm("Delete this book?")) return;
    var d = db(), id = parseInt(t.getAttribute("data-delete"), 10), n = d.books.length;
    d.books = d.books.filter(function (x) { return x.id !== id; });
    flash(d.books.length < n ? "Book deleted successfully." : "Book not found.", d.books.length < n ? "success" : "error");
    save(d); render();
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", function (e) { if (e.key === KEY) render(); });
  render();
})();

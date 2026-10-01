# NovaShop - Basic E-commerce Site

## Technology
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: SQLite
- Authentication: express-session + bcryptjs

## Features
- Product listings
- Product details page
- Search
- Shopping cart using localStorage
- User registration and login
- Order processing
- Stock validation
- Orders page
- SQLite database for users, products and orders

## Run locally

1. Install Node.js.
2. Open Terminal in this project folder.
3. Run:

```bash
npm install
npm start
```

4. Open:

http://localhost:3000

The database file `shop.db` is created automatically on first run.

## Project structure

```text
basic-ecommerce/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── product.html
    ├── cart.html
    ├── auth.html
    ├── orders.html
    ├── style.css
    └── app.js
```

## Important
This is a learning/demo project. For production use, add CSRF protection, secure session storage, HTTPS, input validation, payment gateway integration, admin controls and environment-based secrets.

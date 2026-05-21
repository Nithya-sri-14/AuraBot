# Obsidian Aurora — Premium Personal Portfolio Website

Obsidian Aurora is a high-end, responsive, and visually stunning Personal Portfolio Website built from scratch to demonstrate cutting-edge frontend visual systems and robust Node.js cloud integrations. 

Designed for Creative Full-Stack Engineers & AI Solutions Architects, this portfolio utilizes dynamic theme management (dark/light schemes), responsive grids, accessible dialog panels, and an API form submission processor backed by JSON persistence.

---

## 🌟 Key Features

1. **Obsidian Aurora Design Theme**:
   - Built using standard-compliant **OKLCH color spaces** and modern CSS `light-dark()` tokens.
   - Elegant frosted-glass (glassmorphism) navigation headers, statistics panels, and action dialogs.
   - Smooth layout changes using modern CSS Flexbox and Grid. Fully responsive down to 320px screen widths (zero horizontal scrolling).
   
2. **Dynamic Theme Engine**:
   - Zero-dependency client-side scheme manager synced directly with system preferences (`prefers-color-scheme`).
   - Integrated manual theme override persistent in `localStorage`.
   - Advanced **Flash-Of-Unstyled-Content (FOUC) prevention script** in `<head>` to load the correct user color token immediately before layout painting.

3. **Interactive Project Modals**:
   - High-fidelity visual mockups using premium animated CSS gradients.
   - Interactive project cards opening details using standard HTML `<dialog>` modals with `closedby="any"` support for native light-dismiss (clicking outside or pressing `Esc`).
   - Standard-compliant JavaScript fallback listener to ensure clicking backdrop works flawlessly on older Safari runtimes.

4. **Express.js API & Nodemailer Integration**:
   - Dynamic Node.js server to handle API routing, serve static assets, and receive contact submissions securely.
   - Form logs are validated on the server and written to local database files (`backend/data/contact_messages.json`).
   - Automatic SMTP connection dispatching via `nodemailer` when environment configurations are present.

5. **Performance & Access Audits**:
   - Dependency-free vanilla JavaScript and CSS to score 99+ on performance metrics.
   - Optimized, scalable inline SVG vectors for crystal-clear logo designs and orbital tech graphics.
   - Accessible keyboard-navigable elements, explicit `aria-` labels, and `:user-valid` form validation helpers.

6. **Administrative Control Center (`/admin`)**:
   - Secure, glassmorphic login panel at `/login` complying with sign-in form guidelines (autocomplete parameters, label bindings, password toggle).
   - Rich console UI with sidebar tab selections to manually edit biography items, update metrics, manage skills indexes (inline additions and deletions), and perform CRUD operations on projects via dialog sub-forms.
   - Synchronizes edits directly with backend JSON storage, painting modifications instantly onto the website on next render.

7. **Drag & Drop Resume PDF Uploader**:
   - Beautiful drag zone and file picker accepting PDF documents up to 5MB.
   - Multipart file upload processed securely via Multer, saving to `/assets/resume.pdf` and enabling the resume download button on the main screen dynamically.

---

## 🛠️ Technology Stack

* **Frontend**: HTML5 (Semantic & ARIA tags), Vanilla CSS3 (OKLCH, light-dark, Backdrop Filters), Vanilla JS (ES6+, IntersectionObserver)
* **Backend**: Node.js, Express.js, CORS, Dotenv, Nodemailer (SMTP)
* **Local Database**: Persistent structured JSON file repository

---

## 📂 Project Directory Structure

```text
/Users/user/Desktop/Personal portfolio website
├── README.md                      # Detailed setup & project details
├── package.json                   # Root orchestrator for startup scripts
├── .env.example                   # Secure variables blueprint
├── .env                           # Local parameters configuration (gitignored)
├── backend/                       # Node.js Express server directory
│   ├── package.json               # Backend npm requirements
│   ├── server.js                  # Main server execution logic
│   └── data/                      # Message storage database directory
│       └── contact_messages.json  # Received contact form submissions
└── frontend/                      # Static web assets served by Express
    ├── index.html                 # Semantic HTML framework
    ├── css/
    │   └── style.css              # Obsidian Aurora color tokens & layouts
    ├── js/
    │   └── main.js                # Dynamic sliders, scroll overlays, theme switches & forms
    └── assets/                    # Optimized visual logo & graphics
```

---

## 🚀 Quick Start & Installation

Ensure you have [Node.js](https://nodejs.org/) (v16+) installed.

### Step 1: Clone or Copy the Repository
Place all code folders under your working workspace.

### Step 2: Install All Dependencies
Execute the unified root-level script to install dependencies for both the root orchestrator and backend services:
```bash
npm run install:all
```

### Step 3: Set Up Environment Parameters
Copy the example environment parameters file to create your active configurations:
```bash
cp .env.example .env
```
Open `.env` and customize your server configurations or SMTP credentials:
```env
PORT=5000
NODE_ENV=development

# SMTP parameters (Optional fallback: writes to data/contact_messages.json regardless)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
RECEIVER_EMAIL=your-recipient@gmail.com
```

### Step 4: Run the Application Locally
To launch the Express server and live preview locally, execute:
```bash
# To run in production / standard mode:
npm start

# To run in active developer hot-reloading mode (using Nodemon):
npm run dev
```

Open your browser and navigate to: **[http://localhost:5000](http://localhost:5000)**.

---

## 📦 Deployment Instructions

### Frontend Static Serving (Netlify or Vercel)
If you wish to deploy the frontend as a decoupled static website:
1. Connect your repository to Netlify or Vercel.
2. Select the `frontend` subdirectory as the base publish folder.
3. Configure your AJAX URL inside `frontend/js/main.js` from `/api/contact` to point directly to your deployed backend API (e.g., `https://your-backend.render.com/api/contact`).

### Backend Service Hosting (Render, Heroku, or Fly.io)
To deploy the entire integrated Express server (which hosts backend routes and serves the frontend as static files):
1. Connect your repository to a server platform like **Render** or **Heroku**.
2. Select Node.js as the runtime environment.
3. Set the Root Directory of the deployment to the project directory containing the root `package.json`.
4. Configure the Build Command:
   ```bash
   npm run install:all
   ```
5. Configure the Start Command:
   ```bash
   npm start
   ```
6. Add your environment variables (`PORT`, `NODE_ENV`, `EMAIL_USER`, etc.) in the platform's Environment Variables panel.

---

## 🎨 Design & Code Standards

* **Visual Polish**: Pure oklch colors and frosted layout filters that provide rich depth in both light and dark canvas settings.
* **Code Comments**: Every file (HTML, CSS, JS, Express) is heavily annotated, detailing FOUC preventions, light-dismiss manual boundaries, custom CSS fallbacks, and RESTful routing operations.
* **Semantic Markups**: Strict adherence to HTML5 structural components (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<dialog>`, `<footer>`) ensuring excellent accessibility scoring.

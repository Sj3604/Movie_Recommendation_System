# CineMatch — Movie recommendation website

A responsive HTML/CSS/JavaScript frontend + FastAPI backend using the provided 45,447-movie TF-IDF dataset and The Movie Database (TMDB) API.

## Project layout

```
movie_recommender_deploy/
├── main.py
├── df.pkl
├── indices.pkl
├── tfidf.pkl
├── tfidf_matrix.pkl
├── requirements.txt
├── .python-version
├── .env.example
├── .gitignore
├── render.yaml
└── static/
    ├── index.html
    ├── style.css
    └── script.js
```

## Run locally (VS Code)

1. Install **Python 3.11**, VS Code and the Python extension.
2. Open this folder in VS Code.
3. Create and activate a virtual environment:

   Windows PowerShell:
   ```powershell
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

   macOS/Linux:
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   ```

4. Install packages:
   ```bash
   python -m pip install -r requirements.txt
   ```
5. Copy `.env.example` to `.env` and insert your actual TMDB **API key** (not the Read Access Token):
   ```env
   TMDB_API_KEY=your_actual_key_here
   ```
6. Start the website:
   ```bash
   uvicorn main:app --reload
   ```
7. Open **http://127.0.0.1:8000** in a browser. API documentation: **http://127.0.0.1:8000/docs**.

> Do not open `static/index.html` using VS Code Live Server or the file:// URL. FastAPI serves the HTML and `/static/` assets together.

## Push to GitHub

In the VS Code terminal inside the project folder:

```bash
git init
git add .
git commit -m "Build CineMatch movie recommendation site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Create the **empty** repository first at https://github.com/new. Do not upload `.env` or share your TMDB API key. All four `.pkl` files must be committed or provided to the build by another method. If a repository already has a remote, use `git remote -v` and update rather than adding a duplicate.

## Deploy to Render (single web service)

1. Open https://dashboard.render.com and sign in.
2. Select **New > Web Service**; connect your GitHub account and select the repository. Private repos work after granting Render repository access.
3. Set **Language** to Python 3 and choose the Free instance if desired.
4. Set **Build Command** to `pip install -r requirements.txt`.
5. Set **Start Command** to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
6. In **Environment**, add `TMDB_API_KEY` with your actual key; add `PYTHON_VERSION=3.11.11` if not automatically set from `.python-version`.
7. Select **Deploy Web Service** and watch the logs.
8. Visit the issued `https://YOUR-SERVICE.onrender.com/` URL. Check `/health` and `/docs`.

Alternatively, `render.yaml` provides the corresponding Blueprint configuration. The key must still be entered as a secret during setup; don't put it in the YAML file. Deploying an additional Static Site is not needed.

### Important notes

- TMDB powers browsing, title search, posters and genre recommendations; an internet connection and valid TMDB API key are required.
- TF-IDF recommendations work only for movie titles in `df.pkl` / `indices.pkl`. Other titles can still receive TMDB genre suggestions.
- The application loads pickle files on startup. **Never load pickles from untrusted sources.** The vectorizer was originally saved using scikit-learn 1.6.1; this project's dependencies pin the matching version.
- Render Free services may spin down after inactivity and cold starts can be slower, especially when loading models.
- There are no user accounts or database in this project. The local dataset is read-only and does not need a persistent database.
- The four pickle files are approximately 50 MB combined; GitHub normally permits individual files under 100 MB, but Render memory limits and build times still apply.
